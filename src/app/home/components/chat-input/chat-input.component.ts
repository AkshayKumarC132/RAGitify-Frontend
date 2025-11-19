import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';
import { Document } from '../../../shared/models/document.model';

type AttachmentPanel = 'web' | 'notes' | 'library' | 'prompts' | null;

export type LibrarySelectionEvent =
  | { type: 'library'; libraryId: string | null }
  | { type: 'documents'; documentIds: string[] }
  | { type: 'clear' };

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss']
})
export class ChatInputComponent implements OnChanges {
  @Input() mode: 'normal' | 'web' | 'document' = 'normal';
  @Input() loading = false;
  @Input() libraries: VectorStore[] = [];
  @Input() selectedLibraryId: string | null = null;
  @Input() documents: Document[] = [];
  @Input() selectedDocumentIds: string[] = [];
  @Input() prompts: Assistant[] = [];
  @Input() selectedPromptId: string | null = null;
  @Output() messageSent = new EventEmitter<string>();
  @Output() modeToggle = new EventEmitter<'normal' | 'web'>();
  @Output() filesSelected = new EventEmitter<FileList>();
  @Output() webpageAttached = new EventEmitter<{ url: string; title?: string }>();
  @Output() notesAttached = new EventEmitter<{ title: string; content: string }>();
  @Output() librarySelected = new EventEmitter<LibrarySelectionEvent>();
  @Output() promptSelected = new EventEmitter<string | null>();

  message = '';
  attachmentMenuOpen = false;
  activePanel: AttachmentPanel = null;
  webForm = { url: '', title: '' };
  noteForm = { title: '', content: '' };
  pendingLibraryId: string | null = null;
  pendingPromptId: string | null = null;
  selectionMode: 'library' | 'documents' = 'library';
  pendingDocumentIds = new Set<string>();

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
      this.pendingDocumentIds = new Set(this.selectedDocumentIds || []);
      if (this.selectedDocumentIds?.length) {
        this.selectionMode = 'documents';
      } else if (!this.selectedLibraryId) {
        this.selectionMode = 'library';
      }
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
    const newMode = this.mode === 'web' ? 'normal' : 'web';
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
    
    // Close menu first, then open panel
    this.attachmentMenuOpen = false;
    
    // Use setTimeout to ensure the panel opens after the menu closes
    setTimeout(() => {
      this.activePanel = panel;
      
      if (panel === 'library') {
        this.pendingLibraryId = this.selectedLibraryId;
        this.pendingDocumentIds = new Set(this.selectedDocumentIds || []);
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
    this.selectionMode = 'library';
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
    if (mode === 'documents' && !this.documents.length) {
      return;
    }
    this.selectionMode = mode;
  }

  getDocumentsByLibrary(): { libraryId: string; name: string; documents: Document[] }[] {
    const grouping = new Map<string, Document[]>();
    (this.documents || []).forEach(doc => {
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

  toggleDocumentSelection(documentId: string, selected: boolean): void {
    const next = new Set(this.pendingDocumentIds);
    if (selected) {
      next.add(documentId);
    } else {
      next.delete(documentId);
    }
    this.pendingDocumentIds = next;
  }
}

