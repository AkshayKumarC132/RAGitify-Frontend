import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ChangeDetectorRef, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';
import { Document } from '../../../shared/models/document.model';

type AttachmentPanel = 'web' | 'notes' | 'library' | 'prompts' | null;

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
  | { type: 'documents'; documentIds: string[] }
  | { type: 'clear' };

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss']
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
  @Output() messageSent = new EventEmitter<{content: string, webSearch: boolean} | string>();
  @Output() modeToggle = new EventEmitter<'normal' | 'web' | 'document'>();
  @Output() filesSelected = new EventEmitter<FileList>();
  @Output() webpageAttached = new EventEmitter<{ url: string; title?: string }>();
  @Output() notesAttached = new EventEmitter<{ title: string; content: string }>();
  @Output() librarySelected = new EventEmitter<LibrarySelectionEvent>();
  @Output() promptSelected = new EventEmitter<string | null>();
  @Output() cancelRun = new EventEmitter<void>();
  @Output() attachmentPanelOpened = new EventEmitter<Exclude<AttachmentPanel, null>>();
  @Output() attachmentMenuToggled = new EventEmitter<boolean>();

  message = '';
  attachmentMenuOpen = false;
  activePanel: AttachmentPanel = null;
  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };
  pendingLibraryId: string | null = null;
  pendingPromptId: string | null = null;
  selectionMode: 'documents' = 'documents';
  pendingDocumentIds = new Set<string>();
  public documentSearchQuery = '';
  speechSupported = false;
  isListening = false;
  isOverflowing = false;
  isExpanded = false;
  isWebSearchEnabled = false;
  private recognition: SpeechRecognitionLike | null = null;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.initializeSpeechRecognition();
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedLibraryId']) {
      this.pendingLibraryId = this.selectedLibraryId;
    }
    if (changes['selectedPromptId']) {
      this.pendingPromptId = this.selectedPromptId;
    }
    if (changes['selectedDocumentIds']) {
      this.pendingDocumentIds = new Set((this.selectedDocumentIds || []).map(id => String(id)));
      this.selectionMode = 'documents';
    }
    if (changes['hasExistingThread']) {
      this.enforceDocumentsOnlyMode();
    }
  }

  sendMessage(): void {
    if (this.canSendMessage) {
      this.messageSent.emit({ content: this.message, webSearch: this.isWebSearchEnabled });
      this.message = '';
      this.isExpanded = false;
      setTimeout(() => this.adjustTextareaHeight(), 0);
    }
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

  toggleAttachmentMenu(): void {
    this.attachmentMenuOpen = !this.attachmentMenuOpen;
    if (this.attachmentMenuOpen) {
      this.activePanel = null;
      // Emit event when menu is opened to trigger data loading
      this.attachmentMenuToggled.emit(true);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedAttachmentControl = target.closest('.attachment-controls');
    const clickedPanel = target.closest('.attachment-panel');
    const clickedMenu = target.closest('.attachment-menu');

    if (clickedAttachmentControl || clickedPanel || clickedMenu) {
      return;
    }

    if (!this.attachmentMenuOpen && !this.activePanel) {
      return;
    }

    this.closeMenus();
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

    console.log('Opening panel:', panel);
    console.log('Libraries:', this.libraries.length);
    console.log('Prompts:', this.prompts.length);

    this.attachmentMenuOpen = false;
    this.attachmentPanelOpened.emit(panel);

    setTimeout(() => {
      this.activePanel = panel;

      if (panel === 'library') {
        this.pendingLibraryId = this.selectedLibraryId;
        this.pendingDocumentIds = new Set((this.selectedDocumentIds || []).map(id => String(id)));
        this.documentSearchQuery = '';
        if (this.hasExistingThread) {
          this.enforceDocumentsOnlyMode();
        }
        console.log('Library panel opened, pendingLibraryId:', this.pendingLibraryId);
      }
      if (panel === 'prompts') {
        this.pendingPromptId = this.selectedPromptId;
        console.log('Prompts panel opened, pendingPromptId:', this.pendingPromptId);
      }
    }, 0);
  }

  closePanels(): void {
    this.activePanel = null;
    this.documentSearchQuery = '';
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
    this.librarySelected.emit({ type: 'documents', documentIds: Array.from(this.pendingDocumentIds) });
    this.closePanels();
  }

  clearLibrarySelection(): void {
    this.pendingLibraryId = null;
    this.pendingDocumentIds.clear();
    this.selectionMode = 'documents';
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

  confirmPromptSelection(): void {
    this.promptSelected.emit(this.pendingPromptId || null);
    this.closePanels();
  }

  clearPromptSelection(): void {
    this.pendingPromptId = null;
    this.promptSelected.emit(null);
    this.closePanels();
  }

  getPromptLabel(): string | null {
    if (!this.selectedPromptId) {
      return null;
    }
    const match = this.prompts.find(p => p.id === this.selectedPromptId);
    return match ? (match.name || 'Untitled Prompt') : null;
  }

  private closeMenus(): void {
    this.attachmentMenuOpen = false;
    this.activePanel = null;
  }

  getDocumentsByLibrary(): { libraryId: string; name: string; documents: Document[] }[] {
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
        documents: docs
      }))
      .filter(group => group.documents.length > 0);
  }

  private getLibraryName(libraryId: string): string {
    const match = this.libraries.find(lib => lib.id === libraryId);
    const name = match ? match.name : 'Unknown Library';
    return name.length > 75 ? `${name.slice(0, 75)}...` : name;
  }

  isDocumentSelected(documentId: string): boolean {
    return this.pendingDocumentIds.has(String(documentId));
  }

  isSelectionDisabled(documentId: string): boolean {
    return !this.isDocumentSelected(documentId) && this.pendingDocumentIds.size >= this.maxSelectedDocuments;
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
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = newState;
    }
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

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;

    // Expand when content grows tall enough.
    // Only collapse back when the message is truly empty — never based on scrollHeight alone,
    // because switching layouts changes the textarea width, which changes scrollHeight,
    // which would cause an oscillation loop (expand → wider → fewer lines → collapse → narrower → more lines → expand…)
    if (textarea.scrollHeight > 52) {
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
    void Swal.fire({
      icon: 'warning',
      title: 'Document limit reached',
      text: 'You can attach up to 10 documents in Home Chat.',
      confirmButtonText: 'OK',
      heightAuto: false
    });
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
}
