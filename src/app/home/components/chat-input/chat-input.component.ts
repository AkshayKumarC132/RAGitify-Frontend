import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';

type AttachmentPanel = 'web' | 'notes' | 'library' | 'prompts' | null;

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss']
})
export class ChatInputComponent implements OnChanges {
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

  message = '';
  attachmentMenuOpen = false;
  activePanel: AttachmentPanel = null;
  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };
  pendingLibraryId: string | null = null;
  pendingPromptId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedLibraryId']) {
      this.pendingLibraryId = this.selectedLibraryId;
    }
    if (changes['selectedPromptId']) {
      this.pendingPromptId = this.selectedPromptId;
    }
  }

  sendMessage(): void {
    if (this.message.trim() && !this.loading) {
      this.messageSent.emit(this.message);
      this.message = '';
    }
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
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

  private closeMenus(): void {
    this.attachmentMenuOpen = false;
    this.activePanel = null;
  }
}

