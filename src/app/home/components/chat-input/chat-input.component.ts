import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ChangeDetectorRef, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';
import { Document } from '../../../shared/models/document.model';
import { Run } from '../../../shared/models/run.model';

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
  @ViewChild('messageArea') messageArea?: ElementRef<HTMLTextAreaElement>;

  @Input() mode: 'normal' | 'web' | 'document' = 'document';
  @Input() loading = false;
  @Input() libraries: VectorStore[] = [];
  @Input() selectedLibraryId: string | null = null;
  @Input() documents: Document[] = [];
  @Input() selectedDocumentIds: string[] = [];
  @Input() prompts: Assistant[] = [];
  @Input() selectedPromptId: string | null = null;
  @Input() hasExistingThread = false;
  @Input() isTemporaryChat = false;
  @Input() currentRun: Run | null = null;
  @Input() librariesLoading = false;
  @Input() documentsLoading = false;
  @Input() promptsLoading = false;
  @Output() messageSent = new EventEmitter<string>();
  @Output() modeToggle = new EventEmitter<'normal' | 'web' | 'document'>();
  @Output() filesSelected = new EventEmitter<FileList>();
  @Output() webpageAttached = new EventEmitter<{ url: string; title?: string }>();
  @Output() notesAttached = new EventEmitter<{ title: string; content: string }>();
  @Output() librarySelected = new EventEmitter<LibrarySelectionEvent>();
  @Output() promptSelected = new EventEmitter<string | null>();
  @Output() cancelRun = new EventEmitter<void>();
  @Output() attachmentPanelOpened = new EventEmitter<Exclude<AttachmentPanel, null>>();

  message = '';
  attachmentMenuOpen = false;
  activePanel: AttachmentPanel = null;
  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };
  pendingLibraryId: string | null = null;
  pendingPromptId: string | null = null;
  selectionMode: 'library' | 'documents' = 'library';
  pendingDocumentIds = new Set<string>();
  speechSupported = false;
  isListening = false;
  isOverflowing = false;
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
      if (this.selectedLibraryId) {
        this.selectionMode = 'library';
      }
    }
    if (changes['selectedPromptId']) {
      this.pendingPromptId = this.selectedPromptId;
    }
    if (changes['selectedDocumentIds']) {
      this.pendingDocumentIds = new Set((this.selectedDocumentIds || []).map(id => String(id)));
      if (this.selectedDocumentIds?.length) {
        this.selectionMode = 'documents';
      } else if (!this.selectedLibraryId) {
        this.selectionMode = 'library';
      }
    }
    if (changes['hasExistingThread']) {
      if (this.hasExistingThread) {
        this.enforceDocumentsOnlyMode();
      } else if (!this.selectedDocumentIds?.length && this.selectedLibraryId) {
        this.selectionMode = 'library';
      }
    }
  }

  sendMessage(): void {
    if (this.message.trim() && !this.loading && !this.runActive) {
      this.messageSent.emit(this.message);
      this.message = '';
      setTimeout(() => this.adjustTextareaHeight(), 0);
    }
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onCancelRun(): void {
    if (this.runActive) {
      this.cancelRun.emit();
    }
  }

  onInputChange(): void {
    this.adjustTextareaHeight();
  }

  get runActive(): boolean {
    return !!this.currentRun && ['queued', 'in_progress', 'requires_action'].includes(this.currentRun.status);
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

  toggleAttachmentMenu(): void {
    this.attachmentMenuOpen = !this.attachmentMenuOpen;
    if (this.attachmentMenuOpen) {
      this.activePanel = null;
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
    if (this.selectionMode === 'documents') {
      this.librarySelected.emit({ type: 'documents', documentIds: Array.from(this.pendingDocumentIds) });
    } else {
      this.librarySelected.emit({ type: 'library', libraryId: this.pendingLibraryId || null });
    }
    this.closePanels();
  }

  clearLibrarySelection(): void {
    this.pendingLibraryId = null;
    this.pendingDocumentIds.clear();
    this.selectionMode = this.hasExistingThread ? 'documents' : 'library';
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

  setSelectionMode(mode: 'library' | 'documents'): void {
    if (this.hasExistingThread && mode === 'library') {
      return;
    }
    if (mode === 'documents' && !this.availableDocuments.length) {
      return;
    }
    this.selectionMode = mode;
  }

  getDocumentsByLibrary(): { libraryId: string; name: string; documents: Document[] }[] {
    const grouping = new Map<string, Document[]>();
    this.availableDocuments.forEach(doc => {
      const list = grouping.get(doc.vector_store) || [];
      list.push(doc);
      grouping.set(doc.vector_store, list);
    });

    return Array.from(grouping.entries()).map(([libraryId, docs]) => ({
      libraryId,
      name: this.getLibraryName(libraryId),
      documents: docs
    }));
  }

  private getLibraryName(libraryId: string): string {
    const match = this.libraries.find(lib => lib.id === libraryId);
    return match ? match.name : 'Unknown Library';
  }

  isDocumentSelected(documentId: string): boolean {
    return this.pendingDocumentIds.has(String(documentId));
  }

  toggleDocumentSelectionClick(documentId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    const isCurrentlySelected = this.pendingDocumentIds.has(String(documentId));
    const newState = !isCurrentlySelected;

    this.toggleDocumentSelectionById(documentId, newState);

    const label = event.currentTarget as HTMLElement;
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = newState;
    }
  }

  toggleDocumentSelectionById(documentId: string, selected: boolean): void {
    const next = new Set(this.pendingDocumentIds);
    if (selected) {
      next.add(String(documentId));
    } else {
      next.delete(String(documentId));
    }
    this.pendingDocumentIds = next;
    this.cdr.detectChanges();
  }

  toggleDocumentSelection(documentId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const selected = checkbox.checked;
    this.toggleDocumentSelectionById(documentId, selected);
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
    const baseHeight = Math.max(textarea.scrollHeight, 36);
    const nextHeight = Math.min(baseHeight, 240);
    textarea.style.height = `${nextHeight}px`;
    this.isOverflowing = baseHeight > nextHeight;
  }

  private enforceDocumentsOnlyMode(): void {
    this.selectionMode = 'documents';
    this.pendingLibraryId = null;
  }

  get availableDocuments(): Document[] {
    return (this.documents || []).filter(doc => doc.status !== 'failed');
  }
}
