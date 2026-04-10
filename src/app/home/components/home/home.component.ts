import { Location } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, lastValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatInputComponent, LibrarySelectionEvent } from '../chat-input/chat-input.component';
import { Assistant } from '../../../shared/models/assistant.model';
import { Conversation, ConversationCreateRequest, ConversationMessage } from '../../../shared/models/conversation.model';
import { Document } from '../../../shared/models/document.model';
import { ResponseCreateRequest, ResponseRecord, StreamEvent } from '../../../shared/models/response.model';
import { SelectedLLMProvider, User } from '../../../shared/models/user.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { AssistantService } from '../../../shared/services/assistant.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ConversationService } from '../../../shared/services/conversation.service';
import { DocumentService } from '../../../shared/services/document.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { ThreadSearchPopupService } from '../../../shared/services/thread-search-popup.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild(ChatInputComponent) chatInput?: ChatInputComponent;

  currentThread: Conversation | null = null;
  messages: ConversationMessage[] = [];
  threads: Conversation[] = [];
  currentRun: ResponseRecord | null = null;
  selectedModel: string | null = null;
  mode: 'normal' | 'web' | 'document' = 'normal';
  loading = false;
  allDocuments: Document[] = [];
  selectedLibraryId: string | null = null;
  selectedDocumentIds: string[] = [];
  prompts: Assistant[] = [];
  selectedPromptId: string | null = null;
  attachmentsInProgress = false;
  attachmentMessage = '';
  isSidebarCollapsed = false;
  currentUser: User | null = null;
  setupIncomplete = false;
  dataInitialized = false;
  pendingThreadId: string | null = null;
  profileForm: FormGroup;
  showProfilePanel = false;
  profileMessage = '';
  errorMessage = '';
  warningMessages: string[] = [];
  isTemporaryChat = false;

  private attachmentMessageTimeout?: ReturnType<typeof setTimeout>;
  private errorMessageTimeout?: ReturnType<typeof setTimeout>;
  private warningMessageTimeout?: ReturnType<typeof setTimeout>;
  private responsePollSub?: Subscription;
  private streamSub?: Subscription;
  private searchPopupSub?: Subscription;
  private destroy$ = new Subject<void>();
  private activeProvider: SelectedLLMProvider | null = null;
  private librariesLoaded = false;
  private librariesLoading = false;
  private promptsLoaded = false;
  private promptsLoading = false;
  private promptsLoadingPromise?: Promise<void>;
  private documentsLoaded = false;
  private documentsLoading = false;
  private threadsLoaded = false;
  private threadsLoading = false;

  libraries: VectorStore[] = [];

  private allDefaultQuestions = [
    'How can I improve my productivity?',
    'What are some effective time management techniques?',
    'Can you recommend some good books to read?',
    'Tell me a fun fact about technology.',
    'How can I stay motivated?',
    'What are popular travel destinations?',
    'Tell me an interesting historical fact.',
    'How can I learn a new language?',
    'What are the latest trends in technology?',
    'Can you suggest some fun hobbies?'
  ];

  defaultQuestions: string[] = [];

  documentQuestions = [
    'Summarize the attached documents',
    'What are the key takeaways?',
    'Analyze the main themes in this library',
    'List the most important information found'
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private conversationService: ConversationService,
    private responseService: ResponseService,
    private responseAttentionService: ResponseAttentionService,
    private vectorStoreService: VectorStoreService,
    private assistantService: AssistantService,
    private authService: AuthService,
    private documentService: DocumentService,
    private documentShareService: DocumentShareService,
    private threadSearchPopupService: ThreadSearchPopupService,
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
    this.shuffleDefaultQuestions();
    this.authService.restoreUserFromStorage();
    this.checkPlaygroundRoute(this.router.url);
    this.setupIncomplete = !this.authService.isLlmReady(this.authService.getCurrentStatus());

    if (!this.setupIncomplete && !this.isTemporaryChat) {
      this.initializeData();
    } else {
      this.clearLoadedState();
    }

    this.authService.userStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        const isReady = this.authService.isLlmReady(status);
        this.activeProvider = status?.selected_llm_provider || (status as any)?.active_provider || null;
        this.setupIncomplete = !isReady;

        if (isReady && !this.dataInitialized && !this.isTemporaryChat) {
          this.initializeData();
          if (this.pendingThreadId) {
            this.loadThread(this.pendingThreadId);
          }
        }

        if (!isReady) {
          this.clearLoadedState();
          this.navigateToSetup();
        }
      });

    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        if (user) {
          this.profileForm.patchValue({
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            email: user.email || ''
          }, { emitEvent: false });
        }
      });

    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const threadId = params['conversationId'] || params['threadId'] || null;
        this.pendingThreadId = threadId;
        if (threadId && !this.setupIncomplete && !this.isTemporaryChat) {
          this.loadThread(threadId);
        }
      });

    this.searchPopupSub = this.threadSearchPopupService.getThreadSelected().subscribe(thread => {
      this.onThreadSelected(thread);
    });

    this.router.events
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkPlaygroundRoute(this.router.url);
      });
  }

  ngOnDestroy(): void {
    this.stopResponsePolling();
    this.stopStream();
    this.searchPopupSub?.unsubscribe();
    if (this.errorMessageTimeout) {
      clearTimeout(this.errorMessageTimeout);
    }
    if (this.attachmentMessageTimeout) {
      clearTimeout(this.attachmentMessageTimeout);
    }
    if (this.warningMessageTimeout) {
      clearTimeout(this.warningMessageTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isConversationEmpty(): boolean {
    return !this.currentThread && this.messages.length === 0;
  }

  get isNewChatRoute(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/home' || url === '/home/';
  }

  get showSetupBlocker(): boolean {
    return this.setupIncomplete;
  }

  get suggestedQuestions(): string[] {
    return this.mode === 'document' ? this.documentQuestions : this.defaultQuestions;
  }

  get librariesLoadingState(): boolean {
    return this.librariesLoading;
  }

  get documentsLoadingState(): boolean {
    return this.documentsLoading;
  }

  get promptsLoadingState(): boolean {
    return this.promptsLoading;
  }

  get typingStatuses(): string[] {
    if (this.mode === 'document') {
      return ['Retrieving', 'Searching', 'Thinking', 'Generating'];
    }
    if (this.mode === 'web') {
      return ['Searching', 'Retrieving', 'Thinking', 'Generating'];
    }
    return ['Thinking', 'Retrieving', 'Generating', 'Searching'];
  }

  onManageProfile(): void {
    this.router.navigate(['/settings']);
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

  navigateToSetup(): void {
    this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
  }

  onSidebarToggled(collapsed: boolean): void {
    this.isSidebarCollapsed = collapsed;
  }

  onThreadSelected(thread: Conversation): void {
    this.stopResponsePolling();
    this.currentRun = null;
    this.router.navigate(['/home/chat', thread.id]);
  }

  onNewThread(): void {
    this.pendingThreadId = null;
    this.currentThread = null;
    this.messages = [];
    this.currentRun = null;
    this.selectedLibraryId = null;
    this.selectedDocumentIds = [];
    this.selectedPromptId = null;
    this.attachmentMessage = '';
    this.updateModeFromSelection(true);
    this.warningMessages = [];
    this.errorMessage = '';
    this.stopResponsePolling();
    this.router.navigate(['/home']);
  }

  toggleTemporaryChat(): void {
    if (this.currentRun || this.loading) {
      return;
    }

    if (this.isTemporaryChat) {
      this.router.navigate(['/home']);
      return;
    }

    this.router.navigate(['/temporary-chat']);
  }

  onQuestionSelected(question: string): void {
    this.chatInput?.updateInput(question);
  }

  onAttachmentMenuToggled(opened: boolean): void {
    if (!opened) {
      return;
    }
    this.ensureLibrariesLoaded();
    this.ensureDocumentsLoaded();
    this.ensurePromptsLoaded();
  }

  onAttachmentPanelOpened(panel: 'library' | 'prompts' | 'web' | 'notes'): void {
    if (panel === 'library') {
      this.ensureLibrariesLoaded();
      this.ensureDocumentsLoaded();
    }
    if (panel === 'prompts') {
      this.ensurePromptsLoaded();
    }
  }

  onModeToggle(mode: 'normal' | 'web' | 'document'): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
  }

  async onMessageSent(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || this.isTemporaryChat || this.loading) {
      return;
    }

    this.clearError();
    const optimisticMessage = this.buildLocalMessage('user', trimmed);
    this.messages = [...this.messages, optimisticMessage];
    this.loading = true;
    this.currentRun = { id: 'pending', conversation: this.currentThread?.id || null, status: 'in_progress', model: this.selectedModel || this.responseService.getDefaultModel(), instructions: '', input_messages: [], output: [], metadata: {}, created_at: new Date().toISOString(), completed_at: null };

    try {
      const conversation = await this.ensureConversation(trimmed);
      const request = await this.buildResponseRequest(trimmed, conversation.id);

      // Add a placeholder assistant message for streaming
      const assistantMessage = this.buildLocalMessage('assistant', '');
      this.messages = [...this.messages, assistantMessage];

      this.stopStream();
      this.streamSub = this.responseService.createStream(request).subscribe({
        next: (event: StreamEvent) => {
          if (event.type === 'delta' && event.delta) {
            assistantMessage.content += event.delta;
            // Trigger change detection by reassigning the array
            this.messages = [...this.messages];
          } else if (event.type === 'completed') {
            this.applyWarnings(event.warnings);
            this.finalizeResponse(event.response!, conversation.id);
          } else if (event.type === 'failed') {
            this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
            this.messages = this.messages.filter(m => m.id !== optimisticMessage.id);
            this.currentRun = null;
            this.loading = false;
            this.handleError(event.response?.error_message || 'Response failed', event.response);
          }
        },
        error: (error) => {
          this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
          this.messages = this.messages.filter(m => m.id !== optimisticMessage.id);
          this.currentRun = null;
          this.loading = false;
          this.handleError('Failed to send message', error);
        },
        complete: () => {
          this.loading = false;
        }
      });
    } catch (error) {
      this.messages = this.messages.filter(message => message.id !== optimisticMessage.id);
      this.currentRun = null;
      this.loading = false;
      this.handleError('Failed to send message', error);
    }
  }

  async onFilesSelected(files: FileList): Promise<void> {
    if (!files?.length) {
      return;
    }

    const vectorStoreId = await this.resolveUploadVectorStoreId();
    await this.uploadFiles(Array.from(files), vectorStoreId);
  }

  async onWebpageAttach(payload: { url: string; title?: string }): Promise<void> {
    if (!payload?.url?.trim()) {
      return;
    }

    this.attachmentsInProgress = true;
    try {
      const vectorStoreId = await this.resolveUploadVectorStoreId();
      await lastValueFrom(this.documentService.ingest({
        s3_file_url: payload.url.trim(),
        vector_store_id: vectorStoreId || undefined
      }));
      this.setAttachmentMessage('Webpage attached successfully.');
      this.loadDocuments();
    } catch (error) {
      this.setAttachmentMessage('Failed to attach webpage.');
      console.error('Error attaching webpage:', error);
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  async onNotesAttach(note: { title: string; content: string }): Promise<void> {
    if (!note?.content?.trim()) {
      return;
    }

    const sanitizedTitle = (note.title || 'note').trim().replace(/\s+/g, '-');
    const filename = `${sanitizedTitle || 'note'}-${Date.now()}.txt`;
    const file = new File([note.content], filename, { type: 'text/plain' });
    const vectorStoreId = await this.resolveUploadVectorStoreId();
    await this.uploadFiles([file], vectorStoreId);
  }

  async onLibrarySelected(selection: LibrarySelectionEvent): Promise<void> {
    if (!selection || selection.type === 'clear' || (selection.type === 'library' && !selection.libraryId)) {
      this.selectedLibraryId = null;
      this.selectedDocumentIds = [];
      // this.setAttachmentMessage('Library selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    if (selection.type === 'library') {
      this.selectedLibraryId = selection.libraryId;
      this.selectedDocumentIds = [];
      this.setAttachmentMessage('Library selected for the next reply.');
      this.updateModeFromSelection();
      return;
    }

    this.selectedDocumentIds = (selection.documentIds || []).map(id => String(id));
    this.selectedLibraryId = null;

    if (!this.selectedDocumentIds.length) {
      // this.setAttachmentMessage('Document selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    // this.setAttachmentMessage(`${this.selectedDocumentIds.length} document(s) selected for the next reply.`);
    this.updateModeFromSelection();
  }

  onPromptSelected(promptId: string | null): void {
    this.selectedPromptId = promptId;
    this.setAttachmentMessage(promptId ? 'Prompt selected for the next reply.' : 'Prompt selection cleared.');
  }

  onCancelRun(): void {
    if (!this.currentRun || this.currentRun.status !== 'in_progress') {
      return;
    }

    const responseId = this.currentRun.id;
    this.stopStream();
    this.responseService.cancel(responseId).subscribe({
      next: () => {
        this.currentRun = null;
        this.loading = false;
        this.stopResponsePolling();
      },
      error: (error) => {
        this.handleError('Failed to cancel response', error);
      }
    });
  }

  onThreadRename(event: { thread: Conversation; title: string }): void {
    const title = event.title.trim();
    this.conversationService.update(event.thread.id, { title }).subscribe({
      next: (updated) => {
        this.upsertThread(updated);
        if (this.currentThread?.id === updated.id) {
          this.currentThread = updated;
        }
      },
      error: (error) => {
        console.error('Unable to update conversation title', error);
      }
    });
  }

  onThreadRemove(thread: Conversation): void {
    this.conversationService.delete(thread.id).subscribe({
      next: () => {
        this.threads = this.threads.filter(item => item.id !== thread.id);
        if (this.currentThread?.id === thread.id) {
          this.currentThread = null;
          this.messages = [];
          this.currentRun = null;
          this.stopResponsePolling();
          this.router.navigate(['/home']);
        }
      },
      error: (error) => {
        console.error('Unable to delete conversation', error);
      }
    });
  }

  onWorkspaceNavigate(): void {
    this.router.navigate(['/workspace']);
  }

  logout(): void {
    const token = this.authService.getToken();
    if (token) {
      this.authService.logout(token).subscribe({
        complete: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        },
        error: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        }
      });
      return;
    }
    this.authService.clearAuth();
    this.router.navigate(['/auth/login']);
  }

  dismissWarnings(): void {
    this.warningMessages = [];
  }

  private initializeData(): void {
    if (this.dataInitialized || this.isTemporaryChat) {
      return;
    }
    this.dataInitialized = true;
    this.loadThreads();
  }

  private clearLoadedState(): void {
    this.dataInitialized = false;
    this.threadsLoaded = false;
    this.threadsLoading = false;
    this.documentsLoaded = false;
    this.documentsLoading = false;
    this.librariesLoaded = false;
    this.librariesLoading = false;
    this.promptsLoaded = false;
    this.promptsLoading = false;
    this.threads = [];
    this.currentThread = null;
    this.messages = [];
    this.currentRun = null;
    this.stopResponsePolling();
  }

  private checkPlaygroundRoute(url: string): void {
    const wasTemporary = this.isTemporaryChat;
    this.isTemporaryChat = url.includes('/temporary-chat');

    if (this.isTemporaryChat) {
      return;
    }

    if (!this.setupIncomplete && !this.dataInitialized) {
      this.initializeData();
      if (this.pendingThreadId) {
        this.loadThread(this.pendingThreadId);
      }
      return;
    }

    if (wasTemporary && this.pendingThreadId && !this.currentThread) {
      this.loadThread(this.pendingThreadId);
    }
  }

  private shuffleDefaultQuestions(): void {
    const shuffled = [...this.allDefaultQuestions].sort(() => 0.5 - Math.random());
    this.defaultQuestions = shuffled.slice(0, 5);
  }

  private loadThreads(): void {
    if (this.threadsLoading) {
      return;
    }

    this.threadsLoading = true;
    this.conversationService.list().subscribe({
      next: (threads) => {
        this.threads = this.sortThreads(threads || []).filter(thread => !thread.is_temporary);
        this.threadsLoaded = true;
        this.threadsLoading = false;

        if (this.pendingThreadId && !this.currentThread) {
          this.loadThread(this.pendingThreadId);
        }
      },
      error: (error) => {
        this.threadsLoading = false;
        console.error('Error loading conversations:', error);
      }
    });
  }

  private loadThread(threadId: string): void {
    this.stopResponsePolling();
    this.currentRun = null;
    const existingThread = this.threads.find(thread => thread.id === threadId);

    if (existingThread) {
      this.currentThread = existingThread;
      this.loadMessages(threadId);
      return;
    }

    this.conversationService.getById(threadId).subscribe({
      next: (thread) => {
        this.currentThread = thread;
        this.upsertThread(thread);
        this.loadMessages(threadId);
      },
      error: (error) => {
        console.error('Error hydrating conversation:', error);
        this.messages = [];
      }
    });
  }

  private loadMessages(threadId: string): void {
    this.ensureDocumentsLoaded();
    this.conversationService.getMessages(threadId).subscribe({
      next: (messages) => {
        if (this.currentThread?.id !== threadId && this.pendingThreadId !== threadId) {
          return;
        }
        this.messages = this.decorateMessagesWithAttachments(messages || []);
      },
      error: (error) => {
        console.error('Error loading conversation messages:', error);
      }
    });
  }

  private ensureLibrariesLoaded(): void {
    if (this.librariesLoaded || this.librariesLoading) {
      return;
    }
    this.loadLibraries();
  }

  private ensureDocumentsLoaded(): void {
    if (this.documentsLoaded || this.documentsLoading) {
      return;
    }
    this.loadDocuments();
  }

  private async ensurePromptsLoaded(): Promise<void> {
    if (this.promptsLoaded) {
      return;
    }
    await this.loadPrompts();
  }

  private loadLibraries(): void {
    if (this.librariesLoading) {
      return;
    }

    this.librariesLoading = true;
    this.vectorStoreService.list().subscribe({
      next: (libraries) => {
        this.libraries = libraries || [];
        this.librariesLoaded = true;
        this.librariesLoading = false;
      },
      error: (error) => {
        this.librariesLoading = false;
        console.error('Error loading libraries:', error);
      }
    });
  }

  private loadPrompts(): Promise<void> {
    if (this.promptsLoading) {
      return this.promptsLoadingPromise || Promise.resolve();
    }

    this.promptsLoading = true;
    const request = lastValueFrom(this.assistantService.list())
      .then(prompts => {
        this.prompts = prompts || [];
        this.promptsLoaded = true;
      })
      .catch(error => {
        this.promptsLoaded = false;
        console.error('Error loading prompts:', error);
      })
      .finally(() => {
        this.promptsLoading = false;
        this.promptsLoadingPromise = undefined;
      });

    this.promptsLoadingPromise = request;
    return request;
  }

  loadDocuments(): void {
    if (this.documentsLoading) {
      return;
    }

    this.documentsLoading = true;
    Promise.all([
      lastValueFrom(this.documentService.list(undefined, true)),
      lastValueFrom(this.documentShareService.listSharedWithMe())
    ]).then(([documents, sharedWithMe]) => {
      const ownedDocuments = documents || [];
      const sharedDocuments = this.mapSharedDocuments(sharedWithMe || []);
      const deduped = new Map<string, Document>();

      [...ownedDocuments, ...sharedDocuments].forEach(document => {
        deduped.set(document.id, document);
      });

      this.allDocuments = Array.from(deduped.values());
      this.documentsLoaded = true;
      this.documentsLoading = false;
      if (this.messages.length) {
        this.messages = this.decorateMessagesWithAttachments(this.messages);
      }
    }).catch(error => {
      this.documentsLoading = false;
      console.error('Error loading documents:', error);
    });
  }

  private async ensureConversation(firstMessage: string): Promise<Conversation> {
    if (this.currentThread) {
      return this.currentThread;
    }

    const payload: ConversationCreateRequest = {
      title: this.buildConversationTitle(firstMessage),
      is_temporary: false
    };

    const thread = await lastValueFrom(this.conversationService.create(payload));
    this.currentThread = thread;
    this.pendingThreadId = thread.id;
    this.upsertThread(thread);
    this.location.replaceState(`/home/chat/${thread.id}`);
    return thread;
  }

  private async buildResponseRequest(content: string, conversationId: string): Promise<ResponseCreateRequest> {
    await this.ensurePromptsLoaded();

    const prompt = this.prompts.find(item => item.id === this.selectedPromptId);
    const model = prompt?.model || this.selectedModel || this.responseService.getDefaultModel();
    const instructions = this.buildInstructions(prompt);
    const tools = this.buildTools();

    return {
      conversation: conversationId,
      model,
      instructions,
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: content }]
      }],
      tools,
      metadata: {
        mode: this.mode
      }
    };
  }

  private buildInstructions(prompt?: Assistant): string | undefined {
    const instructionParts: string[] = [];

    if (prompt?.instructions?.trim()) {
      instructionParts.push(prompt.instructions.trim());
    }

    if (this.mode === 'web') {
      instructionParts.push('Use broad web-style reasoning and state uncertainty clearly when context is limited.');
    }

    return instructionParts.length ? instructionParts.join('\n\n') : undefined;
  }

  private buildTools(): ResponseCreateRequest['tools'] | undefined {
    const vectorStoreIds = new Set<string>();

    if (this.selectedLibraryId) {
      vectorStoreIds.add(this.selectedLibraryId);
    }

    if (this.selectedDocumentIds.length) {
      this.allDocuments
        .filter(document => this.selectedDocumentIds.includes(document.id))
        .forEach(document => vectorStoreIds.add(document.vector_store));
    }

    const normalizedVectorStoreIds = Array.from(vectorStoreIds).filter(Boolean);
    if (!normalizedVectorStoreIds.length) {
      return undefined;
    }

    const payload: NonNullable<ResponseCreateRequest['tools']>[number] = {
      type: 'document',
      vector_store_ids: normalizedVectorStoreIds
    };

    if (this.selectedDocumentIds.length) {
      payload.document_ids = [...this.selectedDocumentIds];
    }

    return [payload];
  }

  private startResponsePolling(responseId: string, threadId: string, optimisticMessageId: string): void {
    this.stopResponsePolling();
    this.responsePollSub = this.responseService.pollResponseStatus(responseId).subscribe({
      next: async (response) => {
        if (!response) {
          return;
        }

        this.currentRun = response;
        this.applyWarnings(response.warnings);

        if (response.status === 'completed') {
          await this.finalizeResponse(response, threadId);
          this.stopResponsePolling();
          return;
        }

        if (response.status === 'failed' || response.status === 'cancelled') {
          this.loading = false;
          this.currentRun = null;
          this.messages = this.messages.filter(message => message.id !== optimisticMessageId);
          this.handleError(response.error_message || 'Response failed', response);
          this.stopResponsePolling();
        }
      },
      error: (error) => {
        this.loading = false;
        this.currentRun = null;
        this.stopResponsePolling();
        this.handleError('Failed while waiting for the response', error);
      }
    });
  }

  private stopResponsePolling(): void {
    this.responsePollSub?.unsubscribe();
    this.responsePollSub = undefined;
  }

  private stopStream(): void {
    if (this.streamSub) {
      this.streamSub.unsubscribe();
      this.streamSub = undefined;
    }
  }

  private async finalizeResponse(response: ResponseRecord, threadId: string): Promise<void> {
    this.loading = false;
    this.currentRun = null;
    this.applyWarnings(response.warnings);
    this.responseAttentionService.notifyResponseReady('Home chat response ready', response.output?.[0]?.content?.[0]?.text);
    await this.refreshThread(threadId);
    this.loadMessages(threadId);
  }

  private async refreshThread(threadId: string): Promise<void> {
    try {
      const thread = await lastValueFrom(this.conversationService.getById(threadId));
      this.upsertThread(thread);
      if (this.currentThread?.id === thread.id) {
        this.currentThread = thread;
      }
    } catch (error) {
      console.error('Unable to refresh conversation metadata', error);
    }
  }

  private async resolveUploadVectorStoreId(): Promise<string | null> {
    if (!this.librariesLoaded) {
      this.ensureLibrariesLoaded();
      if (this.librariesLoading) {
        this.libraries = (await lastValueFrom(this.vectorStoreService.list())) || [];
        this.librariesLoaded = true;
      }
    }

    if (this.selectedLibraryId) {
      return this.selectedLibraryId;
    }

    const defaultLibrary = this.libraries.find(library => library.vs_type === 'DEFAULT');
    if (defaultLibrary) {
      return defaultLibrary.id;
    }

    const firstWritableLibrary = this.libraries.find(library => library.vs_type !== 'SHARED');
    return firstWritableLibrary?.id || null;
  }

  private mapSharedDocuments(items: Array<{ document_id: string; document_title: string; shared_at: string; updated_at: string; expires_at: string | null }>): Document[] {
    const sharedLibraryId = this.libraries.find(library => library.vs_type === 'SHARED')?.id || 'shared';

    return items.map(item => ({
      id: item.document_id,
      title: item.document_title,
      original_filename: item.document_title,
      vector_store: sharedLibraryId,
      uploaded_at: item.shared_at,
      created_at: item.shared_at,
      updated_at: item.updated_at || item.shared_at,
      status: 'completed',
      ingestion_status: 'completed',
      access_type: 'shared',
      source: 'LOCAL',
      metadata: item.expires_at ? { expires_at: item.expires_at } : undefined
    }));
  }

  private async uploadFiles(files: File[], vectorStoreId: string | null): Promise<void> {
    if (!files.length) {
      return;
    }

    this.attachmentsInProgress = true;
    try {
      await lastValueFrom(this.documentService.ingest({
        files,
        vector_store_id: vectorStoreId || undefined
      }));

      this.setAttachmentMessage(`Attached ${files.length} item(s) successfully.`);
      this.loadDocuments();
    } catch (error) {
      this.setAttachmentMessage('Failed to upload files.');
      console.error('Error uploading files:', error);
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  private buildLocalMessage(role: 'user' | 'assistant', content: string): ConversationMessage {
    const attachedDocuments = role === 'user'
      ? this.getAttachedDocumentsByIds(this.selectedDocumentIds)
      : [];

    return {
      id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      created_at: new Date().toISOString(),
      metadata: attachedDocuments.length ? { attached_documents: attachedDocuments } : undefined
    };
  }

  private decorateMessagesWithAttachments(messages: ConversationMessage[]): ConversationMessage[] {
    return messages.map((message, index) => {
      if (message.role !== 'user' || message.metadata?.['attached_documents']) {
        return message;
      }

      const documentIds = this.getPersistedDocumentIdsForMessage(message, messages[index + 1]);
      const attachedDocuments = this.getAttachedDocumentsByIds(documentIds);
      if (!attachedDocuments.length) {
        return message;
      }

      return {
        ...message,
        metadata: {
          ...(message.metadata || {}),
          attached_documents: attachedDocuments
        }
      };
    });
  }

  private getPersistedDocumentIdsForMessage(message: ConversationMessage, nextMessage?: ConversationMessage): string[] {
    const directIds = this.extractDocumentIdsFromMetadata(message.metadata);
    if (directIds.length) {
      return directIds;
    }

    if (nextMessage?.role === 'assistant') {
      return this.extractDocumentIdsFromMetadata(nextMessage.metadata);
    }

    return [];
  }

  private extractDocumentIdsFromMetadata(metadata?: Record<string, any>): string[] {
    if (!metadata) {
      return [];
    }

    const directIds = metadata['document_ids'];
    if (Array.isArray(directIds)) {
      return directIds.map(id => String(id)).filter(Boolean);
    }

    const usedIds = metadata['used_document_ids'];
    if (Array.isArray(usedIds)) {
      return usedIds.map(id => String(id)).filter(Boolean);
    }

    const tools = metadata['tools'];
    if (!Array.isArray(tools)) {
      return [];
    }

    const ids = tools.flatMap(tool => Array.isArray(tool?.document_ids) ? tool.document_ids : []);
    return ids.map(id => String(id)).filter(Boolean);
  }

  private getAttachedDocumentsByIds(documentIds: string[]): Array<{ id: string; name: string }> {
    if (!documentIds.length) {
      return [];
    }

    const selectedIds = new Set(documentIds.map(id => String(id)));
    return this.allDocuments
      .filter(document => selectedIds.has(String(document.id)))
      .map(document => ({
        id: String(document.id),
        name: document.title || document.original_filename || `Document ${document.id}`
      }));
  }

  private buildConversationTitle(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.length <= 60 ? normalized : `${normalized.slice(0, 57)}...`;
  }

  private updateModeFromSelection(forceNormal = false): void {
    if (forceNormal && !this.selectedLibraryId && !this.selectedDocumentIds.length) {
      this.mode = 'normal';
      return;
    }

    if (this.selectedLibraryId || this.selectedDocumentIds.length) {
      this.mode = 'document';
      return;
    }

    if (this.mode === 'document') {
      this.mode = 'normal';
    }
  }

  private sortThreads(threads: Conversation[]): Conversation[] {
    return [...threads].sort((left, right) => {
      const leftTimestamp = new Date(left.updated_at || left.created_at).getTime();
      const rightTimestamp = new Date(right.updated_at || right.created_at).getTime();
      return rightTimestamp - leftTimestamp;
    });
  }

  private upsertThread(thread: Conversation): void {
    if (thread.is_temporary) {
      return;
    }

    const existingIndex = this.threads.findIndex(item => item.id === thread.id);
    const next = [...this.threads];

    if (existingIndex >= 0) {
      next[existingIndex] = thread;
    } else {
      next.unshift(thread);
    }

    this.threads = this.sortThreads(next);
  }

  private setAttachmentMessage(message: string): void {
    this.attachmentMessage = message;
    if (this.attachmentMessageTimeout) {
      clearTimeout(this.attachmentMessageTimeout);
    }
    this.attachmentMessageTimeout = setTimeout(() => {
      this.attachmentMessage = '';
    }, 3200);
  }

  private clearError(): void {
    this.errorMessage = '';
    if (this.errorMessageTimeout) {
      clearTimeout(this.errorMessageTimeout);
    }
  }

  private handleError(message: string, error?: unknown): void {
    this.errorMessage = message;
    console.error(message, error);
    if (this.errorMessageTimeout) {
      clearTimeout(this.errorMessageTimeout);
    }
    this.errorMessageTimeout = setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
  }

  private applyWarnings(warnings?: string[]): void {
    this.warningMessages = (warnings || []).filter(warning =>
      !!warning && warning.trim() !== 'Served from semantic cache.'
    );
    if (!this.warningMessages.length) {
      return;
    }

    if (this.warningMessageTimeout) {
      clearTimeout(this.warningMessageTimeout);
    }
    this.warningMessageTimeout = setTimeout(() => {
      this.warningMessages = [];
    }, 6000);
  }

}
