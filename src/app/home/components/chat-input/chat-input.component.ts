import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';

type AttachmentPanel = 'web' | 'notes' | 'library' | 'prompts' | null;

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionResultEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  addEventListener: (type: 'result', listener: (event: SpeechRecognitionResultEvent) => void) => void;
  addEventListener: (type: 'end' | 'error', listener: () => void) => void;
};

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss']
})
export class ChatInputComponent implements OnChanges, OnInit, AfterViewInit {
  @Input() mode: 'normal' | 'web' = 'normal';
  @Input() loading = false;
  @Input() libraries: VectorStore[] = [];
  @Input() selectedLibraryId: string | null = null;
  @Input() prompts: Assistant[] = [];
  @Input() selectedPromptId: string | null = null;
  @Output() messageSent = new EventEmitter<string>();
  @Output() modeToggle = new EventEmitter<'normal' | 'web'>();
  @Output() filesSelected = new EventEmitter<FileList>();
  @Output() webpageAttached = new EventEmitter<{ url: string; title?: string }>();
  @Output() notesAttached = new EventEmitter<{ title: string; content: string }>();
  @Output() librarySelected = new EventEmitter<string | null>();
  @Output() promptSelected = new EventEmitter<string | null>();

  @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

  message = '';
  attachmentMenuOpen = false;
  activePanel: AttachmentPanel = null;
  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };
  pendingLibraryId: string | null = null;
  pendingPromptId: string | null = null;
  isTextareaOverflowing = false;
  isListening = false;
  speechSupported = false;
  private recognition: SpeechRecognitionInstance | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedLibraryId']) {
      this.pendingLibraryId = this.selectedLibraryId;
    }
    if (changes['selectedPromptId']) {
      this.pendingPromptId = this.selectedPromptId;
    }
  }

  ngOnInit(): void {
    this.initializeSpeechRecognition();
  }

  ngAfterViewInit(): void {
    this.adjustTextareaHeight();
  }

  sendMessage(): void {
    if (this.message.trim() && !this.loading) {
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

  handleInputChange(): void {
    this.adjustTextareaHeight();
  }

  toggleMode(): void {
    const newMode = this.mode === 'normal' ? 'web' : 'normal';
    this.modeToggle.emit(newMode);
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
    // Don't close if clicking inside attachment controls, panels, or the container
    if (target.closest('.attachment-controls') || 
        target.closest('.attachment-panel') || 
        target.closest('.chat-input-container')) {
      return;
    }
    // Close menu and panels when clicking outside
    this.attachmentMenuOpen = false;
    this.activePanel = null;
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
    
    // Close menu first, then open panel
    this.attachmentMenuOpen = false;
    
    // Use setTimeout to ensure the panel opens after the menu closes
    setTimeout(() => {
      this.activePanel = panel;
      
      if (panel === 'library') {
        this.pendingLibraryId = this.selectedLibraryId;
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
    this.librarySelected.emit(this.pendingLibraryId || null);
    this.closePanels();
  }

  clearLibrarySelection(): void {
    this.pendingLibraryId = null;
    this.librarySelected.emit(null);
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

  toggleListening(): void {
    if (!this.speechSupported) {
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  get microphoneLabel(): string {
    if (!this.speechSupported) {
      return 'Voice dictation not supported in this browser';
    }
    return this.isListening ? 'Listening... Tap to stop' : 'Start voice dictation';
  }

  private closeMenus(): void {
    this.attachmentMenuOpen = false;
    this.activePanel = null;
  }

  private adjustTextareaHeight(): void {
    const textarea = this.messageInput?.nativeElement;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const maxHeight = 240;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    this.isTextareaOverflowing = textarea.scrollHeight > maxHeight;
  }

  private initializeSpeechRecognition(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognition: SpeechRecognitionConstructor | undefined =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.speechSupported = false;
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = false;
    this.recognition.continuous = false;
    this.speechSupported = true;

    this.recognition.addEventListener('result', (event: SpeechRecognitionResultEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(' ')
        .trim();

      if (transcript) {
        const needsSpace = this.message && !this.message.endsWith(' ');
        this.message = `${this.message}${needsSpace ? ' ' : ''}${transcript}`.trimStart();
        this.adjustTextareaHeight();
      }
    });

    this.recognition.addEventListener('end', () => {
      this.isListening = false;
    });

    this.recognition.addEventListener('error', () => {
      this.isListening = false;
    });
  }

  private startListening(): void {
    if (!this.recognition || this.loading) {
      return;
    }
    this.isListening = true;
    this.recognition.start();
  }

  private stopListening(): void {
    if (!this.recognition) {
      return;
    }
    this.isListening = false;
    this.recognition.stop();
  }
}

