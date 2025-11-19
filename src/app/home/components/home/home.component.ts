import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { switchMap, map, catchError } from 'rxjs/operators';
import { of, lastValueFrom } from 'rxjs';
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
  mode: 'normal' | 'web' = 'normal';
  loading = false;
  knowledgeSources: Document[] = [];
  selectedKnowledgeId: string | null = null;
  libraries: VectorStore[] = [];
  selectedLibraryId: string | null = null;
  prompts: Assistant[] = [];
  selectedPromptId: string | null = null;
  attachmentsInProgress = false;
  attachmentMessage = '';
  currentVectorStoreId: string | null = null;
  isSidebarCollapsed = false;
  currentUser: User | null = null;
  profileForm: FormGroup;
  showProfilePanel = false;
  profileMessage = '';
  private attachmentMessageTimeout?: any;

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
    private fb: FormBuilder
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

    this.route.params.subscribe(params => {
      const threadId = params['threadId'];
      if (threadId) {
        this.loadThread(threadId);
      }
    });
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
    this.messageService.list(threadId).subscribe({
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

    this.loading = true;

    // Auto-create flow: VectorStore -> Thread -> Assistant -> Message -> Run
    this.ensureVectorStoreAndThread().then(({ vectorStoreId, threadId }) => {
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
      this.loading = false;
    });
  }

  private ensureVectorStoreAndThread(): Promise<{ vectorStoreId: string; threadId: string }> {
    // If a library is selected, we still use the current thread's vector store
    // but grant access to documents from the selected library via Document Access API
    // This allows using documents from multiple libraries in the same thread

    if (this.currentThread) {
      const vectorStoreId = this.currentThread.vector_store_id_read;
      this.setCurrentVectorStore(vectorStoreId);
      return Promise.resolve({ vectorStoreId, threadId: this.currentThread.id });
    }

    // Get or create vector store
    return this.vectorStoreService.list().pipe(
      switchMap(vectorStores => {
        this.libraries = vectorStores || [];
        if (vectorStores && vectorStores.length > 0) {
          const existingId = vectorStores[0].id;
          this.setCurrentVectorStore(existingId);
          return of(existingId);
        } else {
          return this.vectorStoreService.create({ name: 'Default' }).pipe(
            map(vs => {
              this.libraries = [vs, ...this.libraries];
              return vs.id;
            })
          );
        }
      }),
      catchError(() => {
        return this.vectorStoreService.create({ name: 'Default' }).pipe(
          map(vs => {
            this.libraries = [vs, ...this.libraries];
            return vs.id;
          })
        );
      }),
      switchMap(vectorStoreId => {
        this.setCurrentVectorStore(vectorStoreId);
        // Create thread
        return this.threadService.create({ vector_store_id: vectorStoreId }).pipe(
          map(thread => {
            this.currentThread = thread;
            this.router.navigate(['/home/chat', thread.id]);
            this.loadThreads();
            return { vectorStoreId, threadId: thread.id };
          })
        );
      })
    ).toPromise() as Promise<{ vectorStoreId: string; threadId: string }>;
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
        this.messages.push(message);
        this.loadMessages(threadId);
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
        this.loading = false;

        // Poll for run status
        this.runService.pollRunStatus(run.id).subscribe({
          next: (updatedRun) => {
            if (updatedRun) {
              this.currentRun = updatedRun;
              if (updatedRun.status === 'completed') {
                this.loadMessages(threadId);
              } else if (updatedRun.status === 'requires_action') {
                // Handle tool calls if needed
                console.log('Run requires action:', updatedRun.required_action);
              }
            }
          },
          error: (err) => {
            console.error('Error polling run:', err);
            this.loading = false;
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
      this.refreshKnowledge(vectorStoreId);
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

  async onLibrarySelected(libraryId: string | null): Promise<void> {
    if (!libraryId) {
      this.selectedLibraryId = null;
      this.setAttachmentMessage('Library selection cleared.');
      return;
    }

    try {
      this.selectedLibraryId = libraryId;
      this.attachmentsInProgress = true;
      this.setAttachmentMessage('Attaching library...');

      const selectedLibrary = this.libraries.find(l => l.id === libraryId);
      if (!selectedLibrary) {
        this.setAttachmentMessage('Library not found.');
        this.attachmentsInProgress = false;
        return;
      }

      // Get all documents from the selected library
      const allDocuments = await lastValueFrom(this.documentService.list());
      const libraryDocuments = allDocuments.filter(doc => doc.vector_store === libraryId);
      
      if (libraryDocuments.length === 0) {
        this.setAttachmentMessage('Selected library has no documents.');
        this.attachmentsInProgress = false;
        return;
      }

      // Get or ensure we have a thread with a vector store
      const { vectorStoreId, threadId } = await this.ensureVectorStoreAndThread();
      
      console.log('Attaching library:', libraryId, 'to vector store:', vectorStoreId, 'with', libraryDocuments.length, 'documents');
      
      // Grant access to all documents from the selected library to the current thread's vector store
      // Ensure document IDs are strings (backend expects strings)
      const documentIds = libraryDocuments.map(doc => String(doc.id));
      console.log('Library documents to grant access:', documentIds);
      
      // Check for existing access to avoid duplicate errors
      let existingAccessIds: string[] = [];
      try {
        const existingAccess = await lastValueFrom(this.documentAccessService.list());
        existingAccessIds = existingAccess
          .filter(access => String(access.vector_store) === String(vectorStoreId))
          .map(access => String(access.document));
        console.log('Existing access IDs for vector store', vectorStoreId, ':', existingAccessIds);
      } catch (err) {
        console.warn('Could not check existing access, proceeding anyway:', err);
      }

      // Filter out documents that already have access
      const newDocumentIds = documentIds.filter(id => !existingAccessIds.includes(id));
      console.log('New document IDs to grant access:', newDocumentIds, 'out of', documentIds.length, 'total');
      
      if (newDocumentIds.length === 0) {
        this.setAttachmentMessage(`Library already attached. ${libraryDocuments.length} document(s) accessible.`);
        this.attachmentsInProgress = false;
        return;
      }

      try {
        const response = await lastValueFrom(
          this.documentAccessService.create({
            document_ids: newDocumentIds,
            vector_store_id: vectorStoreId
          })
        );
        console.log('Document access granted:', response);
        
        // Backend returns a message with access_details
        const message = (response as any)?.message || '';
        const alreadyAttached = libraryDocuments.length - newDocumentIds.length;
        if (alreadyAttached > 0) {
          this.setAttachmentMessage(`${newDocumentIds.length} new document(s) attached. ${alreadyAttached} already accessible.`);
        } else {
          this.setAttachmentMessage(message || `Library attached. ${newDocumentIds.length} document(s) now accessible.`);
        }
      } catch (accessError: any) {
        console.error('Document access error:', accessError);
        // Check if error is about duplicate access (which is fine - backend uses update_or_create)
        const errorMsg = accessError?.error?.document_ids || accessError?.error?.detail || '';
        const errorStr = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
        
        if (errorStr.includes('already granted') || errorStr.includes('already exists') || 
            errorStr.includes('Access already granted')) {
          this.setAttachmentMessage(`Library already attached. ${libraryDocuments.length} document(s) accessible.`);
        } else {
          // Re-throw to be caught by outer catch
          throw accessError;
        }
      }
    } catch (error: any) {
      console.error('Error attaching library:', error);
      const errorMsg = error?.error?.message || error?.error?.document_ids || error?.error?.detail || 'Failed to attach library.';
      this.setAttachmentMessage(`Error: ${errorMsg}`);
    } finally {
      this.attachmentsInProgress = false;
    }
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
      this.refreshKnowledge(vectorStoreId);
      const latest = createdDocs[createdDocs.length - 1];
      if (latest?.id) {
        this.selectedKnowledgeId = latest.id;
      }
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  private setCurrentVectorStore(vectorStoreId: string): void {
    if (this.currentVectorStoreId === vectorStoreId) {
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
      return;
    }
    this.documentService.list().subscribe({
      next: (docs) => {
        this.knowledgeSources = docs.filter(doc => doc.vector_store === targetId);
      },
      error: (err) => {
        console.error('Error loading knowledge sources:', err);
        this.knowledgeSources = [];
      }
    });
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

  private buildRunFilters(): Record<string, any> | undefined {
    if (this.selectedKnowledgeId) {
      return { document_id: this.selectedKnowledgeId };
    }
    return undefined;
  }

  onModeToggle(mode: 'normal' | 'web'): void {
    this.mode = mode;
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

