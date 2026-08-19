import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ChangeDetectorRef, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';
import { Document } from '../../../shared/models/document.model';
import { ToastService } from '../../../shared/services/toast.service';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';
import { DatagridAttachmentService } from '../../../shared/services/datagrid-attachment.service';
import { AttachedDataGrid } from '../../../shared/models/conversation.model';
import { ConnectionSyncService } from '../../../shared/services/connection-sync.service';
import { Subscription } from 'rxjs';
import { ResearchDepth } from '../../../shared/models/response.model';

type AttachmentPanel = 'web' | 'notes' | 'library' | null;

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
};

export type LibrarySelectionEvent =
  | { type: 'library'; libraryId: string | null }
  | { type: 'documents'; documentIds: string[]; databaseConnectionIds?: string[] }
  | { type: 'clear' };

export interface ChatMessagePayload {
  content: string;
  webSearch: boolean;
  researchDepth: ResearchDepth;
}

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatInputComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  private readonly maxSelectedDocuments = 10;
  @ViewChild('messageArea') messageArea?: ElementRef<HTMLTextAreaElement>;

  @Input() mode: 'normal' | 'web' | 'document' = 'normal';
  @Input() loading = false;
  @Input() libraries: VectorStore[] = [];
  @Input() selectedLibraryId: string | null = null;
  @Input() documents: Document[] = [];
  @Input() selectedDocumentIds: string[] = [];
  @Input() databaseConnections: DatabaseConnection[] = [];
  @Input() databaseConnectionsLoading = false;
  @Input() selectedDatabaseConnectionIds: string[] = [];
  @Input() prompts: Assistant[] = [];
  @Input() selectedPromptId: string | null = null;
  @Input() hasExistingThread = false;
  @Input() threadVectorStoreId: string | null = null;
  @Input() isTemporaryChat = false;
  @Input() currentRun: { status: string } | null = null;
  @Input() allowCancelRun = true;
  @Input() librariesLoading = false;
  @Input() documentsLoading = false;
  @Input() promptsLoading = false;
  /** Token usage from the last assistant response in this conversation */
  @Input() tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
  /** Context window size for the selected model — used as the ring limit */
  @Input() tokenLimit = 8_000;

  /** Show the ring only when we have real usage data */
  get showTokenRing(): boolean {
    return !!this.tokenUsage && this.tokenUsage.total_tokens > 0;
  }

  /** Fill percentage 0–100 */
  get tokenFillPercent(): number {
    if (!this.tokenUsage || this.tokenLimit <= 0) return 0;
    return Math.min(100, (this.tokenUsage.total_tokens / this.tokenLimit) * 100);
  }

  get promptTokenPercent(): number {
    if (!this.tokenUsage || this.tokenLimit <= 0) return 0;
    return (this.tokenUsage.prompt_tokens / this.tokenLimit) * 100;
  }

  get completionTokenPercent(): number {
    if (!this.tokenUsage || this.tokenLimit <= 0) return 0;
    return (this.tokenUsage.completion_tokens / this.tokenLimit) * 100;
  }

  /** Arc color that transitions green → amber → red */
  get tokenFillColor(): string {
    const pct = this.tokenFillPercent;
    if (pct >= 85) return '#ef4444';   // red
    if (pct >= 60) return '#f59e0b';   // amber
    return '#22c55e';                  // green
  }

  /**
   * SVG stroke-dasharray for the progress arc.
   * Circle circumference = 2π × r = 2π × 12 ≈ 75.398
   */
  get tokenRingDashArray(): string {
    const circ = 2 * Math.PI * 12;
    const fill = (this.tokenFillPercent / 100) * circ;
    return `${fill} ${circ - fill}`;
  }

  showTokenTooltip = false;

  get shouldOpenUpwards(): boolean {
    if (this.hasExistingThread) {
      return true;
    }
    return (
      (this.selectedDocumentIds && this.selectedDocumentIds.length > 0) ||
      !!this.selectedLibraryId ||
      (this.selectedDatabaseConnectionIds && this.selectedDatabaseConnectionIds.length > 0)
    );
  }

  /** Returns ALL database connections, not just connected ones. */
  get allDatabaseConnections(): DatabaseConnection[] {
    const dbs = this.databaseConnections || [];
    if (this.activeDatabaseTab === 'shared') {
      return dbs.filter(db => db.access_type === 'shared');
    } else {
      return dbs.filter(db => db.access_type !== 'shared');
    }
  }

  /** Returns true when the connection is in a failed/error state. */
  isConnectionFailed(db: DatabaseConnection): boolean {
    const s = (db.status || '').toLowerCase();
    return s === 'failed' || s === 'error';
  }

  isConnectionSyncing(db: DatabaseConnection): boolean {
    return !!db.id && this.connectionSyncService.isSyncing(db.id);
  }

  /** Human-readable status label shown as the badge instead of plain "DB". */
  getConnectionStatusLabel(db: DatabaseConnection): string {
    if (this.isConnectionSyncing(db)) return 'Syncing...';
    const s = (db.status || '').toLowerCase();
    if (s === 'connected' || s === 'success') return 'Connected';
    if (s === 'failed' || s === 'error') return 'Failed';
    if (s === 'pending') return 'Pending';
    return 'DB';
  }

  /** CSS classes for the status badge. */
  getConnectionStatusBadgeClass(db: DatabaseConnection): Record<string, boolean> {
    const isSyncing = this.isConnectionSyncing(db);
    const s = (db.status || '').toLowerCase();
    return {
      'badge-connected': !isSyncing && (s === 'connected' || s === 'success'),
      'badge-failed':    !isSyncing && (s === 'failed'    || s === 'error'),
      'badge-pending':   !isSyncing && s === 'pending',
      'badge-syncing': isSyncing,
      'badge-blue':      !isSyncing && (!s || (s !== 'connected' && s !== 'success' && s !== 'failed' && s !== 'error' && s !== 'pending')),
    };
  }

  @Output() messageSent = new EventEmitter<ChatMessagePayload | string>();
  @Output() modeToggle = new EventEmitter<'normal' | 'web' | 'document'>();
  @Output() filesSelected = new EventEmitter<FileList>();
  @Output() webpageAttached = new EventEmitter<{ url: string; title?: string }>();
  @Output() notesAttached = new EventEmitter<{ title: string; content: string }>();
  @Output() librarySelected = new EventEmitter<LibrarySelectionEvent>();
  @Output() promptSelected = new EventEmitter<string | null>();
  @Output() cancelRun = new EventEmitter<void>();
  @Output() attachmentPanelOpened = new EventEmitter<Exclude<AttachmentPanel, null>>();

  message = '';
  activePanel: AttachmentPanel = null;
  activeDocumentTab: 'my' | 'shared' | 'database' = 'my';
  documentGroups: { libraryId: string; name: string; user?: string | null; documents: Document[] }[] = [];
  activeDatabaseTab: 'my' | 'shared' = 'my';
  attachmentMenuState: 'main' | 'document' | 'connectors' = 'main';
  pendingDatabaseConnectionIds = new Set<string>();

  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };

  readonly slashCommands: { command: string; description: string; action: () => void }[] = [
    { command: '/web', description: 'Toggle web search for this message', action: () => this.applySlashCommand('web') },
    { command: '/lib', description: 'Attach documents from a library', action: () => this.applySlashCommand('lib') }
  ];
  showSlashMenu = false;
  pendingLibraryId: string | null = null;
  selectionMode: 'documents' = 'documents';
  pendingDocumentIds = new Set<string>();
  expandedLibraries = new Set<string>();
  public documentSearchQuery = '';
  speechSupported = false;
  isListening = false;
  isOverflowing = false;
  isExpanded = false;
  isWebSearchEnabled = false;
  researchDepth: ResearchDepth = 'normal';
  showResearchDepthMenu = false;
  showMoreDocsMenu = false;
  private recognition: SpeechRecognitionLike | null = null;
  attachedDataGrid: AttachedDataGrid | null = null;
  private datagridSub: Subscription | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dbService: DatabaseConnectionService,
    private datagridAttachmentService: DatagridAttachmentService,
    private connectionSyncService: ConnectionSyncService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.initializeSpeechRecognition();
    this.datagridSub = this.datagridAttachmentService.attachedDataGrid$.subscribe(grid => {
      this.attachedDataGrid = grid;
      this.cdr.detectChanges();
    });
  }

  getDatabaseIcon(db: DatabaseConnection): string {
    const typeName = (
      db.connection_type?.driver_name ||
      db.connection_type?.name ||
      db.metadata?.['connection_type'] ||
      db.metadata?.['type'] ||
      (db.port === 8123 || db.port === 9000 ? 'clickhouse' : '')
    ).toString().toLowerCase();
    
    if (typeName.includes('postgres')) return 'assets/postgres.svg';
    if (typeName.includes('clickhouse')) return 'assets/clickhouse.svg';
    if (typeName.includes('mysql')) return 'assets/mysql.svg';
    if (typeName.includes('mongodb')) return 'assets/mongodb.svg';
    if (typeName.includes('redis')) return 'assets/redis.svg';
    if (typeName.includes('snowflake')) return 'assets/snowflake.svg';
    if (typeName.includes('bigquery')) return 'assets/bigquery.svg';
    
    return 'assets/postgres.svg'; // fallback
  }

  getDatabaseConnection(dbId: string): DatabaseConnection | undefined {
    return this.databaseConnections?.find(db => db.id === dbId);
  }

  ngAfterViewInit(): void {
    this.adjustTextareaHeight();
  }

  ngOnDestroy(): void {
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.stop();
    }
    if (this.datagridSub) {
      this.datagridSub.unsubscribe();
    }
  }

  removeAttachedDataGrid(event: Event): void {
    event.stopPropagation();
    this.datagridAttachmentService.clearAttachment();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedLibraryId']) {
      this.pendingLibraryId = this.selectedLibraryId;
    }
    if (changes['selectedDocumentIds']) {
      this.pendingDocumentIds = new Set((this.selectedDocumentIds || []).map(id => String(id)));
      this.selectionMode = 'documents';
    }
    if (changes['selectedDatabaseConnectionIds']) {
      this.pendingDatabaseConnectionIds = new Set((this.selectedDatabaseConnectionIds || []).map(id => String(id)));
      this.selectionMode = 'documents';
    }
    if (changes['hasExistingThread']) {
      this.enforceDocumentsOnlyMode();
    }
    if (changes['documents']) {
      this.updateDocumentGroups();
    }
    if (changes['libraries']) {
      this.updateDocumentGroups();
    }
  }

  sendMessage(): void {
    if (!this.canSendMessage) {
      return;
    }

    this.emitMessage();
  }

  private emitMessage(): void {
    this.messageSent.emit({
      content: this.message,
      webSearch: this.isWebSearchEnabled,
      researchDepth: this.researchDepth,
    });
    this.message = '';
    this.isExpanded = false;
    setTimeout(() => this.adjustTextareaHeight(), 0);
  }

  updateInput(text: string): void {
    this.message = text;
    setTimeout(() => this.adjustTextareaHeight(), 0);
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onCancelRun(): void {
    if (this.runActive && this.allowCancelRun) {
      this.cancelRun.emit();
    }
  }

  onInputChange(): void {
    this.adjustTextareaHeight();
    this.showSlashMenu = this.message === '/' || /^\/\w*$/.test(this.message);
  }

  get filteredSlashCommands(): { command: string; description: string; action: () => void }[] {
    if (!this.showSlashMenu) return [];
    const query = this.message.toLowerCase();
    return this.slashCommands.filter(cmd => cmd.command.startsWith(query));
  }

  applySlashCommand(kind: 'web' | 'lib'): void {
    this.message = '';
    this.showSlashMenu = false;
    setTimeout(() => this.adjustTextareaHeight(), 0);
    if (kind === 'web') {
      this.isWebSearchEnabled = !this.isWebSearchEnabled;
    } else if (kind === 'lib') {
      this.openPanel('library');
    }
  }

  get runActive(): boolean {
    return !!this.currentRun && ['queued', 'in_progress', 'requires_action'].includes(this.currentRun.status);
  }

  get canSendMessage(): boolean {
    return !!this.message.trim() && !this.loading && !this.runActive;
  }

  toggleWebMode(): void {
    if (this.mode === 'web') {
      this.modeToggle.emit('document');
    } else {
      this.modeToggle.emit('web');
    }
  }

  selectMode(newMode: 'normal' | 'web' | 'document'): void {
    if (this.mode !== newMode) {
      this.modeToggle.emit(newMode);
    }
  }

  toggleWebSearch(): void {
    this.isWebSearchEnabled = !this.isWebSearchEnabled;
  }

  toggleResearchDepthMenu(): void {
    this.showResearchDepthMenu = !this.showResearchDepthMenu;
  }

  selectResearchDepth(researchDepth: ResearchDepth): void {
    this.researchDepth = researchDepth;
    this.showResearchDepthMenu = false;
  }

  getResearchDepthLabel(): string {
    switch (this.researchDepth) {
      case 'fast':
        return 'Fast';
      case 'deep':
        return 'Deep Research';
      default:
        return 'Normal';
    }
  }

  getResearchDepthIcon(): string {
    switch (this.researchDepth) {
      case 'fast':
        return 'fa-bolt';
      case 'deep':
        return 'fa-magnifying-glass';
      default:
        return 'fa-wand-magic-sparkles';
    }
  }



  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedAttachmentControl = target.closest('.attachment-controls');
    const clickedPanel = target.closest('.attachment-panel');
    const clickedMenu = target.closest('.attachment-menu');
    const clickedMoreDocsMenu = target.closest('.more-docs-wrapper');
    const clickedResearchDepthSelector = target.closest('.response-mode-selector');

    if (!clickedMoreDocsMenu && this.showMoreDocsMenu) {
      this.showMoreDocsMenu = false;
    }

    if (!clickedResearchDepthSelector && this.showResearchDepthMenu) {
      this.showResearchDepthMenu = false;
    }

    if (!clickedAttachmentControl && !clickedPanel && !clickedMenu && this.activePanel) {
      this.closeMenus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.showResearchDepthMenu = false;
  }

  triggerFilePicker(input: HTMLInputElement): void {
    input.click();
    this.closeMenus();
  }

  handleFilesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.filesSelected.emit(input.files);
      input.value = '';
    }
  }

  openPanel(panel: AttachmentPanel): void {
    if (!panel) return;

    if (this.activePanel === panel) {
      this.closePanels();
      return;
    }

    this.attachmentPanelOpened.emit(panel);

    this.activePanel = panel;

    if (panel === 'library') {
      this.expandedLibraries.clear();
      this.attachmentMenuState = 'main';
      this.pendingLibraryId = this.selectedLibraryId;
      this.pendingDocumentIds = new Set((this.selectedDocumentIds || []).map(id => String(id)));
      this.pendingDatabaseConnectionIds = new Set((this.selectedDatabaseConnectionIds || []).map(id => String(id)));
      this.documentSearchQuery = '';
      if (this.hasExistingThread) {
        this.enforceDocumentsOnlyMode();
      }
    }

    this.cdr.detectChanges();
  }

  closePanels(): void {
    this.autoApplyDocumentSelection();
    this.activePanel = null;
    this.documentSearchQuery = '';
    this.cdr.detectChanges();
  }

  submitWebForm(): void {
    if (!this.webForm.url.trim()) {
      return;
    }
    this.webpageAttached.emit({
      url: this.webForm.url.trim(),
      title: this.webForm.title?.trim() || undefined
    });
    this.webForm = { url: '', title: '' };
    this.closePanels();
  }

  submitNoteForm(): void {
    if (!this.noteForm.content.trim()) {
      return;
    }
    this.notesAttached.emit({
      title: this.noteForm.title.trim() || 'Untitled Note',
      content: this.noteForm.content.trim()
    });
    this.noteForm = { title: '', content: '' };
    this.closePanels();
  }

  confirmLibrarySelection(): void {
    this.librarySelected.emit({
      type: 'documents',
      documentIds: Array.from(this.pendingDocumentIds),
      databaseConnectionIds: Array.from(this.pendingDatabaseConnectionIds)
    });
    this.activePanel = null;
    this.documentSearchQuery = '';
  }

  clearLibrarySelection(): void {
    this.pendingLibraryId = null;
    this.pendingDocumentIds.clear();
    this.pendingDatabaseConnectionIds.clear();
    this.selectionMode = 'documents';
    this.showMoreDocsMenu = false;
    this.librarySelected.emit({ type: 'clear' });
    this.closePanels();
  }

  getLibraryLabel(): string | null {
    if (!this.selectedLibraryId) {
      return null;
    }
    const match = this.libraries.find(lib => lib.id === this.selectedLibraryId);
    return match ? match.name : null;
  }

  private closeMenus(): void {
    this.autoApplyDocumentSelection();
    this.activePanel = null;
    this.cdr.detectChanges();
  }

  getDocumentsByLibrary(): { libraryId: string; name: string; user?: string | null; documents: Document[] }[] {
    const grouping = new Map<string, Document[]>();
    this.availableDocuments.forEach(doc => {
      const list = grouping.get(doc.vector_store) || [];
      list.push(doc);
      grouping.set(doc.vector_store, list);
    });

    return Array.from(grouping.entries())
      .map(([libraryId, docs]) => ({
        libraryId,
        name: this.getLibraryName(libraryId),
        user: docs.length > 0 && docs[0].user ? docs[0].user : null,
        documents: docs
      }))
      .filter(group => group.documents.length > 0);
  }

  private getLibraryName(libraryId: string): string {
    const match = this.libraries.find(lib => lib.id === libraryId);
    const name = match ? match.name : 'Shared';
    return name.length > 75 ? `${name.slice(0, 75)}...` : name;
  }

  isDocumentSelected(documentId: string): boolean {
    return this.pendingDocumentIds.has(String(documentId));
  }

  isDatabaseSelected(dbId: string | undefined): boolean {
    if (!dbId) return false;
    return this.pendingDatabaseConnectionIds.has(String(dbId));
  }

  isSelectionDisabled(documentId: string): boolean {
    return !this.isDocumentSelected(documentId) && this.pendingDocumentIds.size >= this.maxSelectedDocuments;
  }

  toggleLibraryGroup(libraryId: string): void {
    if (this.expandedLibraries.has(libraryId)) {
      this.expandedLibraries.delete(libraryId);
    } else {
      this.expandedLibraries.add(libraryId);
    }
  }

  isLibraryExpanded(libraryId: string): boolean {
    return this.documentSearchQuery.trim().length > 0 || this.expandedLibraries.has(libraryId);
  }

  get selectedDocumentsCount(): number {
    return this.pendingDocumentIds.size;
  }

  get selectionSlotsRemaining(): number {
    return Math.max(0, this.maxSelectedDocuments - this.pendingDocumentIds.size);
  }

  getDocumentSourceLabel(document: Document): string {
    return document.access_type === 'shared' ? 'Shared' : 'Owned';
  }

  getDocumentTypeLabel(document: Document): string {
    return (document.file_type || document.original_filename?.split('.').pop() || 'file').toUpperCase();
  }

  getDocumentDisplayName(document: Document): string {
    return document.title || document.original_filename || `Document ${document.id}`;
  }

  updateDocumentGroups(): void {
    const filtered = this.availableDocuments.filter(doc => {
      if (this.activeDocumentTab === 'shared') {
        return doc.access_type === 'shared';
      }
      return doc.access_type !== 'shared';
    });

    const grouping = new Map<string, Document[]>();
    filtered.forEach(doc => {
      const list = grouping.get(doc.vector_store) || [];
      list.push(doc);
      grouping.set(doc.vector_store, list);
    });

    this.documentGroups = Array.from(grouping.entries())
      .map(([libraryId, docs]) => ({
        libraryId,
        name: this.getLibraryName(libraryId),
        user: docs.length > 0 && docs[0].user ? docs[0].user : null,
        documents: docs
      }))
      .filter(group => group.documents.length > 0);
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getFileTypeColor(doc: Document): string {
    const type = (doc.file_type || doc.original_filename?.split('.').pop() || '').toLowerCase();
    if (type === 'pdf') return 'red';
    if (['doc', 'docx'].includes(type)) return 'blue';
    if (['xls', 'xlsx', 'csv'].includes(type)) return 'green';
    if (['ppt', 'pptx'].includes(type)) return 'orange';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(type)) return 'purple';
    return 'gray';
  }

  getDocumentFileIcon(doc: Document): string {
    const type = (doc.file_type || doc.original_filename?.split('.').pop() || '').toLowerCase();
    const iconMap: Record<string, string> = {
      'pdf': 'fa-file-pdf',
      'doc': 'fa-file-word',
      'docx': 'fa-file-word',
      'xls': 'fa-file-excel',
      'xlsx': 'fa-file-excel',
      'csv': 'fa-file-csv',
      'ppt': 'fa-file-powerpoint',
      'pptx': 'fa-file-powerpoint',
      'txt': 'fa-file-lines',
      'md': 'fa-file-lines',
    };
    return iconMap[type] || 'fa-file';
  }

  private autoApplyDocumentSelection(): void {
    if (this.activePanel !== 'library') return;

    const pendingArray = Array.from(this.pendingDocumentIds);
    const pendingDbArray = Array.from(this.pendingDatabaseConnectionIds);

    if (pendingArray.length > 0 || pendingDbArray.length > 0) {
      this.librarySelected.emit({
        type: 'documents',
        documentIds: pendingArray,
        databaseConnectionIds: pendingDbArray
      });
      this.selectionMode = 'documents';
    } else if (this.selectedDocumentIds.length > 0 || this.selectedDatabaseConnectionIds.length > 0) {
      this.librarySelected.emit({ type: 'clear' });
    }
  }

  toggleDocumentSelectionClick(documentId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const isCurrentlySelected = this.pendingDocumentIds.has(String(documentId));
    const newState = !isCurrentlySelected;
    const updated = this.toggleDocumentSelectionById(documentId, newState);
    if (!updated) {
      this.showSelectionLimitAlert();
      return;
    }

    const label = event.currentTarget as HTMLElement;
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (checkbox) {
      checkbox.checked = newState;
    }
  }

  toggleDatabaseSelectionClick(dbId: string | undefined, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!dbId) return;

    // Block selection for failed/error or syncing connections
    const conn = this.databaseConnections?.find(db => String(db.id) === String(dbId));
    if (conn && (this.isConnectionFailed(conn) || this.isConnectionSyncing(conn))) return;

    const isCurrentlySelected = this.pendingDatabaseConnectionIds.has(String(dbId));

    if (isCurrentlySelected) {
      this.pendingDatabaseConnectionIds.delete(String(dbId));
    } else {
      this.pendingDatabaseConnectionIds.add(String(dbId));
    }

    this.cdr.detectChanges();
  }

  navigateToConnection(dbId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/connectors', dbId]);
  }

  toggleDocumentSelectionById(documentId: string, selected: boolean): boolean {
    if (selected && !this.pendingDocumentIds.has(String(documentId)) && this.pendingDocumentIds.size >= this.maxSelectedDocuments) {
      return false;
    }
    const next = new Set(this.pendingDocumentIds);
    if (selected) {
      next.add(String(documentId));
    } else {
      next.delete(String(documentId));
    }
    this.pendingDocumentIds = next;
    this.cdr.detectChanges();
    return true;
  }

  toggleDocumentSelection(documentId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const selected = checkbox.checked;
    const updated = this.toggleDocumentSelectionById(documentId, selected);
    if (!updated) {
      checkbox.checked = false;
      this.showSelectionLimitAlert();
    }
  }

  toggleNormalMode(event: Event): void {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      if (this.mode !== 'normal') {
        this.modeToggle.emit('normal');
      }
    } else {
      if (this.mode === 'normal') {
        this.modeToggle.emit('document');
      }
    }
  }

  private initializeSpeechRecognition(): void {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.speechSupported = false;
      return;
    }

    this.recognition = new SpeechRecognitionCtor() as SpeechRecognitionLike;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.speechSupported = true;

    this.recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      if (finalTranscript) {
        this.message = `${this.message ? this.message + ' ' : ''}${finalTranscript.trim()}`.trim();
        this.adjustTextareaHeight();
        this.cdr.detectChanges();
      }

      if (interimTranscript) {
        this.cdr.detectChanges();
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.cdr.detectChanges();
    };

    this.recognition.onerror = () => {
      this.isListening = false;
      this.cdr.detectChanges();
    };
  }

  private startListening(): void {
    if (!this.recognition || this.loading) {
      return;
    }
    this.recognition.start();
    this.isListening = true;
    this.cdr.detectChanges();
  }

  private stopListening(): void {
    if (!this.recognition) {
      return;
    }
    this.recognition.stop();
    this.isListening = false;
    this.cdr.detectChanges();
  }

  toggleVoiceInput(): void {
    if (!this.speechSupported || !this.recognition) {
      return;
    }
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  private adjustTextareaHeight(): void {
    const textarea = this.messageArea?.nativeElement;
    if (!textarea) {
      return;
    }

    const maxHeight = 120;

    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    this.isOverflowing = contentHeight > maxHeight;

    // Expand when content grows tall enough.
    // Only collapse back when the message is truly empty — never based on scrollHeight alone,
    // because switching layouts changes the textarea width, which changes scrollHeight,
    // which would cause an oscillation loop (expand → wider → fewer lines → collapse → narrower → more lines → expand…)
    if (contentHeight > 52) {
      this.isExpanded = true;
    } else if (!this.message) {
      this.isExpanded = false;
    }
  }

  private enforceDocumentsOnlyMode(): void {
    this.selectionMode = 'documents';
    this.pendingLibraryId = null;
  }

  private showSelectionLimitAlert(): void {
    this.toast.warning('Document limit reached', 'You can attach up to 10 documents in Home Chat.');
  }

  get availableDocuments(): Document[] {
    const query = this.documentSearchQuery.trim().toLowerCase();
    return (this.documents || []).filter(doc => {
      if (this.getDocumentStatus(doc) === 'failed') {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        doc.title,
        doc.original_filename,
        doc.file_type,
        doc.id
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }

  getDocumentStatus(document: Document): string {
    return document.ingestion_status || document.status || 'completed';
  }

  getDocumentDate(document: Document): string | undefined {
    return document.created_at || document.updated_at || document.uploaded_at;
  }

  get selectedDocuments(): Document[] {
    return this.selectedDocumentIds.map(id => this.documents.find(d => String(d.id) === String(id))).filter(d => !!d) as Document[];
  }

  get visibleSelectedDocuments(): Document[] {
    return this.selectedDocuments.slice(0, 5);
  }

  get hiddenSelectedDocuments(): Document[] {
    return this.selectedDocuments.slice(5);
  }

  removeSelectedDocument(id: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.toggleDocumentSelectionById(id, false);

    // Auto emit changes to update right away
    const pendingArray = Array.from(this.pendingDocumentIds);
    const pendingDbArray = Array.from(this.pendingDatabaseConnectionIds);
    if (pendingArray.length > 0 || pendingDbArray.length > 0) {
      this.librarySelected.emit({
        type: 'documents',
        documentIds: pendingArray,
        databaseConnectionIds: pendingDbArray
      });
    } else {
      this.librarySelected.emit({ type: 'clear' });
    }
  }

  getDatabaseDisplayName(dbId: string): string {
    const match = this.databaseConnections.find(db => String(db.id) === String(dbId));
    return match ? (match.name || match.database_name || 'Database') : 'Database';
  }

  removeSelectedDatabase(id: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.pendingDatabaseConnectionIds.delete(String(id));

    const pendingArray = Array.from(this.pendingDocumentIds);
    const pendingDbArray = Array.from(this.pendingDatabaseConnectionIds);
    if (pendingArray.length > 0 || pendingDbArray.length > 0) {
      this.librarySelected.emit({
        type: 'documents',
        documentIds: pendingArray,
        databaseConnectionIds: pendingDbArray
      });
    } else {
      this.librarySelected.emit({ type: 'clear' });
    }
  }

  removeSelectedLibrary(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.clearLibrarySelection();
  }

  toggleMoreDocsMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.showMoreDocsMenu = !this.showMoreDocsMenu;
  }
}
