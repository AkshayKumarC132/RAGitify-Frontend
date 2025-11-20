import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { switchMap, map, catchError } from 'rxjs/operators';
import { of, lastValueFrom, EMPTY } from 'rxjs';
import { ThreadService } from '../../../shared/services/thread.service';
import { MessageService } from '../../../shared/services/message.service';
import { RunService } from '../../../shared/services/run.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { AssistantService } from '../../../shared/services/assistant.service';
import { OpenAIKeyService } from '../../../shared/services/openai-key.service';
import { AuthService } from '../../../shared/services/auth.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentAccessService } from '../../../shared/services/document-access.service';
import { Thread } from '../../../shared/models/thread.model';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';
import { OpenAIKey } from '../../../shared/models/openai-key.model';
import { Document } from '../../../shared/models/document.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Assistant } from '../../../shared/models/assistant.model';
import { User } from '../../../shared/models/user.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LibrarySelectionEvent } from '../chat-input/chat-input.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  currentThread: Thread | null = null;
  messages: Message[] = [];
  threads: Thread[] = [];
  currentRun: Run | null = null;
  selectedModel: OpenAIKey | null = null;
  availableModels: OpenAIKey[] = [];
  mode: 'normal' | 'web' | 'document' = 'document';
  loading = false;
  knowledgeSources: Document[] = [];
  allDocuments: Document[] = [];
  selectedKnowledgeId: string | null = null;
  libraries: VectorStore[] = [];
  selectedLibraryId: string | null = null;
  selectedDocumentIds: string[] = [];
  prompts: Assistant[] = [];
  selectedPromptId: string | null = null;
  attachmentsInProgress = false;
  attachmentMessage = '';
  currentVectorStoreId: string | null = null;
  documentSelectionVectorStoreId: string | null = null;
  isSidebarCollapsed = false;
  currentUser: User | null = null;
  profileForm: FormGroup;
  showProfilePanel = false;
  profileMessage = '';
  private attachmentMessageTimeout?: any;
  private enforceDocumentMode = true;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private threadService: ThreadService,
    private messageService: MessageService,
    private runService: RunService,
    private vectorStoreService: VectorStoreService,
    private assistantService: AssistantService,
    private openAIKeyService: OpenAIKeyService,
    private authService: AuthService,
    private documentService: DocumentService,
    private documentAccessService: DocumentAccessService,
    private fb: FormBuilder,
    private location: Location
  ) {
    this.profileForm = this.fb.group({
      first_name: [''],
      last_name: [''],
      email: ['', [Validators.email]]
    });
  }

  ngOnInit(): void {
    this.authService.restoreUserFromStorage();
    this.loadModels();
    this.loadThreads();
    this.loadLibraries();
    this.loadPrompts();
    this.loadDocuments();

    this.authService.currentUser$.subscribe(user => {
      console.log('[HomeComponent] currentUser$ emitted', {
        hasUser: !!user,
        tokenAvailable: !!this.authService.getToken()
      });
      this.currentUser = user;
      if (user) {
        this.profileForm.patchValue({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || ''
        }, { emitEvent: false });
      } else {
        console.warn('[HomeComponent] user is null - sidebar profile cannot render', {
          storedUser: this.authService.getStoredUser()
        });
      }
    });

    this.route.params.pipe(
      switchMap(params => {
        const threadId = params['threadId'];
        if (threadId) {
          this.loadThread(threadId);
        }
        return EMPTY;
      })
    ).subscribe();
  }

  onManageProfile(): void {
    this.showProfilePanel = true;
  }

  closeProfilePanel(): void {
    this.showProfilePanel = false;
    this.profileMessage = '';
  }

  saveProfile(): void {
    if (!this.currentUser || this.profileForm.invalid) {
      return;
    }

    const token = this.authService.getToken();
    const updatedUser: User = {
      ...this.currentUser,
      ...this.profileForm.value
    };

    if (token) {
      this.authService.setAuth(token, updatedUser);
    }

    this.currentUser = updatedUser;
    this.profileMessage = 'Profile updated locally';
    setTimeout(() => {
      this.profileMessage = '';
    }, 2500);
  }

  get isConversationEmpty(): boolean {
    return !this.currentThread && this.messages.length === 0;
  }

  onThreadRename(event: { thread: Thread; title: string }): void {
    this.threadService.update(event.thread.id, { title: event.title }).subscribe({
      next: (updated) => {
        this.threads = this.threads.map(t => (t.id === updated.id ? updated : t));
        if (this.currentThread?.id === updated.id) {
          this.currentThread = updated;
        }
      },
      error: (err) => console.error('Unable to update thread title', err)
    });
  }

  onThreadRemove(thread: Thread): void {
    this.threadService.delete(thread.id).subscribe({
      next: () => {
        this.threads = this.threads.filter(t => t.id !== thread.id);
        if (this.currentThread?.id === thread.id) {
          this.currentThread = null;
          this.messages = [];
          this.router.navigate(['/home']);
        }
      },
      error: (err) => console.error('Unable to delete thread', err)
    });
  }

  loadModels(): void {
    this.openAIKeyService.list().subscribe({
      next: (models) => {
        this.availableModels = models;
        const activeModel = models.find(m => m.is_active);
        if (activeModel) {
          this.selectedModel = activeModel;
        } else if (models.length > 0) {
          this.selectedModel = models[0];
        }
      },
      error: (err) => console.error('Error loading models:', err)
    });
  }

  loadThreads(): void {
    this.threadService.list().subscribe({
      next: (threads) => {
        this.threads = threads;
      },
      error: (err) => console.error('Error loading threads:', err)
    });
  }

  loadThread(threadId: string): void {
    this.threadService.getById(threadId).subscribe({
      next: (thread) => {
        this.currentThread = thread;
        this.loadMessages(threadId);
        this.setCurrentVectorStore(thread.vector_store_id_read);
      },
      error: (err) => console.error('Error loading thread:', err)
    });
  }

  loadMessages(threadId: string): void {
    this.threadService.getMessages(threadId).subscribe({
      next: (messages) => {
        this.messages = messages;
      },
      error: (err) => console.error('Error loading messages:', err)
    });
  }

  onSidebarToggled(collapsed: boolean): void {
    this.isSidebarCollapsed = collapsed;
  }

  onThreadSelected(thread: Thread): void {
    this.router.navigate(['/home/chat', thread.id]);
  }

  onNewThread(): void {
    this.currentThread = null;
    this.messages = [];
    this.router.navigate(['/home']);
  }

  onMessageSent(content: string): void {
    if (!content.trim()) return;

    const optimisticMessage: Message = {
      id: Date.now(),
      thread_id: '',
      user: '',
      content: content,
      role: 'user',
      created_at: new Date().toISOString()
    };

    this.messages.push(optimisticMessage);

    this.ensureVectorStoreAndThread().then(({ vectorStoreId, threadId }) => {
      optimisticMessage.thread_id = threadId;
      return this.ensureAssistant(vectorStoreId, threadId);
    }).then(({ assistantId, threadId }) => {
      return this.createMessage(threadId, content).then(({ messageId }) => ({
        messageId,
        threadId,
        assistantId
      }));
    }).then(({ messageId, threadId, assistantId }) => {
      return this.createRun(threadId, assistantId, messageId);
    }).catch((error) => {
      console.error('Error in message flow:', error);
      this.currentRun = null;
    });
  }

  private async ensureVectorStoreAndThread(): Promise<{ vectorStoreId: string; threadId: string }> {
    const vectorStoreId = await this.getDesiredVectorStoreId();

    if (this.currentThread && this.currentThread.vector_store_id_read === vectorStoreId) {
      this.setCurrentVectorStore(vectorStoreId);
      return { vectorStoreId, threadId: this.currentThread.id };
    }

    const thread = await lastValueFrom(
      this.threadService.create({ vector_store_id: vectorStoreId })
    );
    this.currentThread = thread;
    this.setCurrentVectorStore(vectorStoreId);

    // Update URL without triggering navigation/component destruction
    this.location.replaceState(`/home/chat/${thread.id}`);

    this.loadThreads();
    return { vectorStoreId, threadId: thread.id };
  }

  private async getDesiredVectorStoreId(): Promise<string> {
    if (this.selectedDocumentIds.length) {
      return this.ensureDocumentSelectionVectorStore();
    }

    if (this.selectedLibraryId) {
      this.setCurrentVectorStore(this.selectedLibraryId);
      return this.selectedLibraryId;
    }

    if (this.currentVectorStoreId) {
      return this.currentVectorStoreId;
    }

    return this.ensureDefaultVectorStore();
  }

  private async ensureDefaultVectorStore(): Promise<string> {
    try {
      const vectorStores = await lastValueFrom(this.vectorStoreService.list());
      this.libraries = vectorStores || [];
      if (vectorStores && vectorStores.length > 0) {
        const existingId = vectorStores[0].id;
        this.setCurrentVectorStore(existingId);
        return existingId;
      }
    } catch (error) {
      console.error('Error fetching vector stores, creating default:', error);
    }

    const created = await lastValueFrom(this.vectorStoreService.create({ name: 'Default' }));
    this.libraries = [created, ...this.libraries];
    this.setCurrentVectorStore(created.id);
    return created.id;
  }

  private async ensureDocumentSelectionVectorStore(): Promise<string> {
    if (!this.selectedDocumentIds.length) {
      throw new Error('No documents selected for attachment');
    }

    if (this.documentSelectionVectorStoreId) {
      this.setCurrentVectorStore(this.documentSelectionVectorStoreId);
      return this.documentSelectionVectorStoreId;
    }

    const vectorStore = await lastValueFrom(
      this.vectorStoreService.create({ name: `Selection-${Date.now()}` })
    );

    await lastValueFrom(
      this.documentAccessService.create({
        document_ids: this.selectedDocumentIds.map(id => String(id)),
        vector_store_id: vectorStore.id
      })
    );

    this.documentSelectionVectorStoreId = vectorStore.id;
    this.setCurrentVectorStore(vectorStore.id);
    this.loadLibraries();
    return vectorStore.id;
  }

  private ensureAssistant(vectorStoreId: string, threadId: string): Promise<{ assistantId: string; threadId: string }> {
    // If a prompt is selected, use it
    if (this.selectedPromptId) {
      const selectedPrompt = this.prompts.find(p => p.id === this.selectedPromptId);
      if (selectedPrompt) {
        // If the prompt has a different vector store, we might need to handle that
        // For now, use the selected prompt's assistant
        return Promise.resolve({ assistantId: selectedPrompt.id, threadId });
      }
    }

    return this.assistantService.list().pipe(
      switchMap(assistants => {
        // Update prompts list
        this.prompts = assistants || [];

        const existingAssistant = assistants?.find(a => a.vector_store_id === vectorStoreId);
        if (existingAssistant) {
          return of({ assistantId: existingAssistant.id, threadId });
        }

        // Create new assistant
        const model = this.selectedModel?.model || 'gpt-4o';
        return this.assistantService.create({
          name: 'Default Assistant',
          vector_store_id: vectorStoreId,
          instructions: 'You are a helpful assistant.',
          model: model,
          tools: []
        }).pipe(
          map(assistant => {
            this.prompts = [...this.prompts, assistant];
            return { assistantId: assistant.id, threadId };
          })
        );
      }),
      catchError(() => {
        // Create new assistant on error
        const model = this.selectedModel?.model || 'gpt-4o';
        return this.assistantService.create({
          name: 'Default Assistant',
          vector_store_id: vectorStoreId,
          instructions: 'You are a helpful assistant.',
          model: model,
          tools: []
        }).pipe(
          map(assistant => {
            this.prompts = [...this.prompts, assistant];
            return { assistantId: assistant.id, threadId };
          })
        );
      })
    ).toPromise() as Promise<{ assistantId: string; threadId: string }>;
  }

  private createMessage(threadId: string, content: string): Promise<{ messageId: number; threadId: string }> {
    return this.messageService.create({ thread_id: threadId, content }).pipe(
      map(message => {
        // Update the optimistic message with the real message
        // Find by content and role since the optimistic message has a temporary timestamp ID
        const optimisticIndex = this.messages.findIndex(m =>
          m.role === 'user' &&
          m.content === content &&
          typeof m.id === 'number' &&
          m.id > 1000000000000 // timestamp-based ID
        );
        if (optimisticIndex !== -1) {
          this.messages[optimisticIndex] = message;
        }
        return { messageId: message.id, threadId };
      })
    ).toPromise() as Promise<{ messageId: number; threadId: string }>;
  }

  private createRun(threadId: string, assistantId: string, messageId: number): Promise<void> {
    const payload: any = {
      thread_id: threadId,
      assistant_id: assistantId,
      message_id: messageId,
      mode: this.mode
    };
    const filters = this.buildRunFilters();
    if (filters) {
      payload.filters = filters;
    }

    return this.runService.create(payload).pipe(
      switchMap(run => {
        this.currentRun = run;

        this.runService.pollRunStatus(run.id).subscribe({
          next: (updatedRun) => {
            if (updatedRun) {
              this.currentRun = updatedRun;
              if (updatedRun.status === 'completed') {
                this.loadMessages(threadId);
                this.loadThreads();
                this.threadService.getById(threadId).subscribe(t => this.currentThread = t);
              } else if (updatedRun.status === 'failed' || updatedRun.status === 'cancelled') {
                this.currentRun = null;
              } else if (updatedRun.status === 'requires_action') {
                console.log('Run requires action:', updatedRun.required_action);
              }
            }
          },
          error: (err) => {
            console.error('Error polling run:', err);
            this.currentRun = null;
          }
        });

        return of(undefined);
      })
    ).toPromise() as Promise<void>;
  }

  async onFilesSelected(files: FileList): Promise<void> {
    if (!files || !files.length) return;
    try {
      const { vectorStoreId } = await this.ensureVectorStoreAndThread();
      await this.uploadFiles(Array.from(files), vectorStoreId);
    } catch (error) {
      console.error('Error uploading files:', error);
      this.setAttachmentMessage('Failed to upload files.');
    }
  }

  async onWebpageAttach(payload: { url: string; title?: string }): Promise<void> {
    if (!payload?.url) return;
    try {
      const { vectorStoreId } = await this.ensureVectorStoreAndThread();
      this.attachmentsInProgress = true;
      const response = await lastValueFrom(
        this.documentService.ingest({ s3_file_url: payload.url, vector_store_id: vectorStoreId })
      );
      this.setAttachmentMessage('Webpage attached successfully.');
      this.loadDocuments(vectorStoreId);
      if (response?.id) {
        this.selectedKnowledgeId = response.id;
      }
    } catch (error) {
      console.error('Error attaching webpage:', error);
      this.setAttachmentMessage('Failed to attach webpage.');
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  async onNotesAttach(note: { title: string; content: string }): Promise<void> {
    if (!note?.content?.trim()) return;
    try {
      const { vectorStoreId } = await this.ensureVectorStoreAndThread();
      const sanitizedTitle = (note.title || 'note').trim().replace(/\s+/g, '-');
      const filename = `${sanitizedTitle || 'note'}-${Date.now()}.txt`;
      const file = new File([note.content], filename, { type: 'text/plain' });
      await this.uploadFiles([file], vectorStoreId);
    } catch (error) {
      console.error('Error attaching note:', error);
      this.setAttachmentMessage('Failed to attach note.');
    }
  }

  onKnowledgeSelected(documentId: string | null): void {
    this.selectedKnowledgeId = documentId;
    this.setAttachmentMessage(documentId ? 'Knowledge pinned for the next reply.' : 'Knowledge selection cleared.');
  }

  onLibrarySelected(selection: LibrarySelectionEvent): void {
    if (!selection || selection.type === 'clear' || (selection.type === 'library' && !selection.libraryId)) {
      this.selectedLibraryId = null;
      this.selectedDocumentIds = [];
      this.documentSelectionVectorStoreId = null;
      this.setCurrentVectorStore(null);
      this.setAttachmentMessage('Library selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    if (selection.type === 'library') {
      this.selectedLibraryId = selection.libraryId;
      this.selectedDocumentIds = [];
      this.documentSelectionVectorStoreId = null;
      this.setAttachmentMessage('Library selected for the next reply.');
      this.resetConversationState();
      this.setCurrentVectorStore(selection.libraryId);
      this.updateModeFromSelection();
      return;
    }

    const documentIds = selection.documentIds || [];
    this.selectedDocumentIds = documentIds;
    this.selectedLibraryId = null;
    this.documentSelectionVectorStoreId = null;
    this.setCurrentVectorStore(null);

    if (!documentIds.length) {
      this.setAttachmentMessage('Document selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    this.setAttachmentMessage(`${documentIds.length} document(s) selected.`);
    this.resetConversationState();
    this.updateModeFromSelection();
  }

  onPromptSelected(promptId: string | null): void {
    this.selectedPromptId = promptId;
    this.setAttachmentMessage(promptId ? 'Prompt selected for the next reply.' : 'Prompt selection cleared.');
  }

  loadLibraries(): void {
    this.vectorStoreService.list().subscribe({
      next: (libraries) => {
        this.libraries = libraries || [];
      },
      error: (err) => {
        console.error('Error loading libraries:', err);
        this.libraries = [];
      }
    });
  }

  loadPrompts(): void {
    this.assistantService.list().subscribe({
      next: (prompts) => {
        this.prompts = prompts || [];
      },
      error: (err) => {
        console.error('Error loading prompts:', err);
        this.prompts = [];
      }
    });
  }

  loadDocuments(vectorStoreId?: string): void {
    this.documentService.list().subscribe({
      next: (docs) => {
        this.allDocuments = docs || [];
        this.applyKnowledgeFilter(vectorStoreId);
      },
      error: (err) => {
        console.error('Error loading documents:', err);
        this.allDocuments = [];
        this.knowledgeSources = [];
      }
    });
  }

  private async uploadFiles(files: File[], vectorStoreId: string): Promise<void> {
    if (!files.length) {
      return;
    }
    this.attachmentsInProgress = true;
    try {
      const createdDocs = await Promise.all(
        files.map(file => lastValueFrom(this.documentService.ingest({ file, vector_store_id: vectorStoreId })))
      );
      this.setAttachmentMessage(`Attached ${createdDocs.length} item(s) successfully.`);
      this.loadDocuments(vectorStoreId);
      const latest = createdDocs[createdDocs.length - 1];
      if (latest?.id) {
        this.selectedKnowledgeId = latest.id;
      }
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  private setCurrentVectorStore(vectorStoreId: string | null): void {
    if (!vectorStoreId) {
      this.currentVectorStoreId = null;
      this.selectedKnowledgeId = null;
      this.knowledgeSources = [];
      return;
    }

    if (this.currentVectorStoreId === vectorStoreId) {
      this.refreshKnowledge(vectorStoreId);
      return;
    }
    this.currentVectorStoreId = vectorStoreId;
    this.selectedKnowledgeId = null;
    this.refreshKnowledge(vectorStoreId);
    // Reload libraries to ensure we have the latest list
    this.loadLibraries();
  }

  private refreshKnowledge(vectorStoreId?: string): void {
    const targetId = vectorStoreId || this.currentVectorStoreId;
    if (!targetId) {
      this.knowledgeSources = [];
      return;
    }

    if (!this.allDocuments.length) {
      this.loadDocuments(targetId);
      return;
    }

    this.applyKnowledgeFilter(targetId);
  }

  private applyKnowledgeFilter(vectorStoreId: string | undefined): void {
    if (!vectorStoreId) {
      this.knowledgeSources = [];
      return;
    }
    this.knowledgeSources = this.allDocuments.filter(doc => doc.vector_store === vectorStoreId);
  }

  private setAttachmentMessage(message: string): void {
    this.attachmentMessage = message;
    if (this.attachmentMessageTimeout) {
      clearTimeout(this.attachmentMessageTimeout);
    }
    this.attachmentMessageTimeout = setTimeout(() => {
      this.attachmentMessage = '';
    }, 4000);
  }

  private resetConversationState(): void {
    this.currentThread = null;
    this.currentRun = null;
    this.messages = [];
    this.router.navigate(['/home']);
  }

  private updateModeFromSelection(forceNormal = false): void {
    if (this.selectedLibraryId || this.selectedDocumentIds.length) {
      this.mode = 'document';
      this.enforceDocumentMode = false;
      return;
    }

    if (forceNormal) {
      this.enforceDocumentMode = false;
      this.mode = 'normal';
      return;
    }
    if (this.enforceDocumentMode) {
      this.mode = 'document';
      return;
    }
    if (this.mode === 'document') {
      this.mode = 'normal';
    }
  }

  private buildRunFilters(): Record<string, any> | undefined {
    if (this.selectedKnowledgeId) {
      return { document_id: this.selectedKnowledgeId };
    }
    return undefined;
  }

  onModeToggle(mode: 'normal' | 'web' | 'document'): void {
    if (mode === 'web') {
      this.mode = 'web';
      this.enforceDocumentMode = false;
      return;
    }
    if (mode === 'document') {
      this.mode = 'document';
      this.enforceDocumentMode = false;
      return;
    }
    this.mode = 'normal';
    this.updateModeFromSelection(true);
  }

  onModelSelected(model: OpenAIKey): void {
    this.selectedModel = model;
  }

  onWorkspaceNavigate(): void {
    this.router.navigate(['/workspace']);
  }

  logout(): void {
    const token = this.authService.getToken();
    if (token) {
      this.authService.logout(token).subscribe({
        next: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        },
        error: () => {
          // Clear auth even if logout fails
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        }
      });
    } else {
      this.authService.clearAuth();
      this.router.navigate(['/auth/login']);
    }
  }
}

