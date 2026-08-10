import { Location } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, lastValueFrom, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import {
  ChatInputComponent,
  ChatMessagePayload,
  LibrarySelectionEvent,
} from '../chat-input/chat-input.component';
import { Assistant } from '../../../shared/models/assistant.model';
import {
  Conversation,
  ConversationCreateRequest,
  ConversationMessage,
} from '../../../shared/models/conversation.model';
import { Document } from '../../../shared/models/document.model';
import {
  ResponseRecord,
  ResponseCreateRequest,
  ResponseInput,
  StreamEvent,
  TaskItem,
  DocumentTool,
  DataGridTool,
  ResearchDepth,
  Tool,
} from '../../../shared/models/response.model';
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
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { ConnectionShareService } from '../../../shared/services/connection-share.service';
import {
  DatabaseConnection,
  FailedConnectionInfo,
} from '../../../shared/models/database-connection.model';
import { ConnectionSharedWithMeItem } from '../../../shared/models/connection-share.model';
import { SharedWithMeItem } from '../../../shared/models/document-share.model';
import { DatagridAttachmentService } from '../../../shared/services/datagrid-attachment.service';
import { ChatStreamService } from '../../../shared/services/chat-stream.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import {
  ConversationExportService,
  ExportFormat,
} from '../../../shared/services/conversation-export.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild(ChatInputComponent) chatInput?: ChatInputComponent;

  private _currentThread: Conversation | null = null;
  get currentThread(): Conversation | null {
    return this._currentThread;
  }
  set currentThread(thread: Conversation | null) {
    this._currentThread = thread;
    if (this.chatStreamService) {
      this.chatStreamService.setActiveThreadId(thread?.id || null);
    }
  }
  messages: ConversationMessage[] = [];
  threads: Conversation[] = [];
  currentRun: ResponseRecord | null = null;
  selectedModel: string | null = null;
  mode: 'normal' | 'web' | 'document' = 'normal';
  loading = false;
  allDocuments: Document[] = [];
  selectedLibraryId: string | null = null;
  selectedDocumentIds: string[] = [];
  databaseConnections: DatabaseConnection[] = [];
  selectedDatabaseConnectionIds: string[] = [];
  prompts: Assistant[] = [];
  currentTasks: TaskItem[] = [];
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
  showConnectionWarningModal = false;
  failedDbConnections: FailedConnectionInfo[] = [];
  private _pendingRetryMessageId: string | null = null;
  private _pendingRetryContent: string | null = null;
  private _pendingRetryWebSearch: boolean = false;
  private _pendingRetryResearchDepth: ResearchDepth = 'normal';
  /** Last user message text — used by the connection-warning retry flow. */
  private _lastMessageContent = '';
  private _lastMessageWebSearch = false;
  private _lastMessageResearchDepth: ResearchDepth = 'normal';
  conversationMenuOpen = false;
  /** Token usage from the most recent assistant response in this thread */
  currentTokenUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null = null;
  private ephemeralMetadataMap = new Map<string, any>();

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
  private databaseConnectionsLoaded = false;
  public databaseConnectionsLoading = false;
  threadsLoaded = false;
  threadsLoading = false;

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
    'Can you suggest some fun hobbies?',
  ];

  defaultQuestions: string[] = [];

  // Memoized — updated in updateTypingStatuses() so OnPush ChatContainerComponent
  // only re-renders when mode actually changes, not on every CD cycle.
  private _typingStatuses: string[] = [
    'Thinking',
    'Retrieving',
    'Generating',
    'Searching',
  ];

  documentQuestions = [
    'Summarize the attached documents',
    'What are the key takeaways?',
    'Analyze the main themes in this library',
    'List the most important information found',
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
    private dbConnectionService: DatabaseConnectionService,
    private connectionShareService: ConnectionShareService,
    private threadSearchPopupService: ThreadSearchPopupService,
    private chatStreamService: ChatStreamService,
    private confirmDialogService: ConfirmDialogService,
    private exportService: ConversationExportService,
    private datagridAttachmentService: DatagridAttachmentService,
    private toast: ToastService,
    private fb: FormBuilder,
    private location: Location,
    private cdr: ChangeDetectorRef,
  ) {
    this.profileForm = this.fb.group({
      first_name: [''],
      last_name: [''],
      email: ['', [Validators.email]],
    });
  }

  ngOnInit(): void {
    this.shuffleDefaultQuestions();
    this.authService.restoreUserFromStorage();
    this.checkPlaygroundRoute(this.router.url);
    this.setupIncomplete = !this.authService.isLlmReady(
      this.authService.getCurrentStatus(),
    );

    if (!this.setupIncomplete && !this.isTemporaryChat) {
      this.initializeData();
    } else {
      this.clearLoadedState();
    }

    this.authService.userStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        const isReady = this.authService.isLlmReady(status);
        this.activeProvider =
          status?.selected_llm_provider ||
          (status as any)?.active_provider ||
          null;
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
      .subscribe((user) => {
        this.currentUser = user;
        if (user) {
          this.profileForm.patchValue(
            {
              first_name: user.first_name || '',
              last_name: user.last_name || '',
              email: user.email || '',
            },
            { emitEvent: false },
          );
        }
      });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const threadId = params['conversationId'] || params['threadId'] || null;
      this.pendingThreadId = threadId;
      if (threadId && !this.setupIncomplete && !this.isTemporaryChat) {
        this.loadThread(threadId);
      }
    });

    this.searchPopupSub = this.threadSearchPopupService
      .getThreadSelected()
      .subscribe((thread) => {
        this.onThreadSelected(thread);
      });

    this.router.events.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
    this.chatStreamService.setActiveThreadId(null);
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
    return this.mode === 'document'
      ? this.documentQuestions
      : this.defaultQuestions;
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
    return this._typingStatuses;
  }

  /**
   * Context-window size for the currently selected model.
   * Used to set the token ring's "limit" denominator in the chatbar.
   */
  get currentTokenLimit(): number {
    const model = (this.selectedModel || '').toLowerCase();
    const limits: [string, number][] = [
      ['gpt-4o', 128_000],
      ['gpt-4-turbo', 128_000],
      ['gpt-4-32k', 32_768],
      ['gpt-4', 8_192],
      ['gpt-3.5-turbo-16k', 16_385],
      ['gpt-3.5-turbo', 16_385],
      ['claude-3', 200_000],
      ['claude-2', 100_000],
      ['gemini-1.5-pro', 1_048_576],
      ['gemini-1.5-flash', 1_048_576],
      ['gemini-pro', 32_768],
      ['mistral-large', 32_768],
      ['mixtral', 32_768],
      ['llama-3', 8_192],
      ['llama-2', 4_096],
    ];
    for (const [key, limit] of limits) {
      if (model.includes(key)) return limit;
    }
    return 8_000;
  }

  private updateTypingStatuses(): void {
    if (this.mode === 'document') {
      this._typingStatuses = [
        'Retrieving',
        'Searching',
        'Thinking',
        'Generating',
      ];
    } else if (this.mode === 'web') {
      this._typingStatuses = [
        'Searching',
        'Retrieving',
        'Thinking',
        'Generating',
      ];
    } else {
      this._typingStatuses = [
        'Thinking',
        'Retrieving',
        'Generating',
        'Searching',
      ];
    }
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
      ...this.profileForm.value,
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
    this.router.navigate(['/setup-llm'], {
      queryParams: { reason: 'llm_required' },
    });
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
    // Detach the local UI subscription so the response doesn't appear here,
    // but keep the background HTTP stream alive so the backend can finish
    // processing and persist both user query and assistant response.
    this.stopStream();

    this.pendingThreadId = null;
    this.currentThread = null;
    this.messages = [];
    this.currentRun = null;
    this.loading = false;
    this.selectedLibraryId = null;
    this.selectedDocumentIds = [];
    this.selectedPromptId = null;
    this.attachmentMessage = '';
    this.currentTokenUsage = null;
    this.updateModeFromSelection(true);
    this.datagridAttachmentService.clearAttachment();
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

  onAttachmentPanelOpened(
    panel: 'library' | 'prompts' | 'web' | 'notes',
  ): void {
    if (panel === 'library') {
      this.ensureLibrariesLoaded();
      this.ensureDocumentsLoaded();
      this.ensureDatabaseConnectionsLoaded();
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
    this.updateTypingStatuses();
  }

  async onMessageSent(
    payload: ChatMessagePayload | string,
  ): Promise<void> {
    const isObject = typeof payload === 'object' && payload !== null;
    const content = isObject ? (payload as ChatMessagePayload).content : payload;
    const webSearch = isObject ? (payload as ChatMessagePayload).webSearch : false;
    const researchDepth = isObject ? (payload as ChatMessagePayload).researchDepth : 'normal';
    const trimmed = content.trim();
    if (!trimmed || this.isTemporaryChat || this.loading) {
      return;
    }
    this._lastMessageContent = trimmed;
    this._lastMessageWebSearch = webSearch;
    this._lastMessageResearchDepth = researchDepth;

    this.clearError();
    const optimisticMessage = this.buildLocalMessage('user', trimmed);
    this.messages = [...this.messages, optimisticMessage];
    this.loading = true;
    this.currentRun = {
      id: 'pending',
      conversation: this.currentThread?.id || null,
      status: 'in_progress',
      model: this.selectedModel || this.responseService.getDefaultModel(),
      instructions: '',
      input_messages: [],
      output: [],
      metadata: {},
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    try {
      const conversation = await this.ensureConversation(trimmed);
      const request = await this.buildResponseRequest(
        trimmed,
        conversation.id,
        webSearch,
        researchDepth,
      );

      // Add a placeholder assistant message for streaming
      const assistantMessage = this.buildLocalMessage('assistant', '');
      this.messages = [...this.messages, assistantMessage];

      // Instead of ResponseService.createStream, use ChatStreamService to start the stream
      this.streamSub = this.chatStreamService
        .startStream(
          conversation.id,
          request,
          optimisticMessage,
          assistantMessage,
          conversation.title || trimmed,
        )
        .subscribe({
          next: (event: StreamEvent) => {
            if (event.type === 'delta' && event.delta) {
              // assistantMessage.content is already updated by ChatStreamService.
              // Create a new object reference for the last message so OnPush-enabled
              // MessageBubbleComponent detects the change without ngDoCheck.
              const lastIdx = this.messages.length - 1;
              this.messages = [
                ...this.messages.slice(0, lastIdx),
                { ...assistantMessage },
              ];
              // Hide task list once text starts streaming
              if (this.currentTasks.length > 0) {
                this.currentTasks = [];
              }
            } else if (event.type === 'task_update') {
              this.currentTasks = (event.tasks || []).filter(
                (t) => t.status !== 'removed',
              );
            } else if (event.type === 'completed') {
              this.currentTasks = [];
              this.applyWarnings(event.warnings);
              const outMetadata = event.response?.output?.[0]?.metadata;
              if (outMetadata) {
                this.ephemeralMetadataMap.set(
                  String(conversation.id),
                  outMetadata,
                );
              }
              assistantMessage.metadata = {
                ...(assistantMessage.metadata || {}),
                ...(outMetadata || {}),
              };
              this.finalizeResponse(event.response!, conversation.id);
            } else if (event.type === 'failed') {
              this.currentTasks = [];
              this.messages = this.messages.filter(
                (m) => m.id !== assistantMessage.id,
              );
              this.messages = this.messages.filter(
                (m) => m.id !== optimisticMessage.id,
              );
              this.currentRun = null;
              this.loading = false;
              this.handleError(
                event.response?.error_message || 'Response failed',
                event.response,
              );
            }
          },
          error: (error) => {
            this.messages = this.messages.filter(
              (m) => m.id !== assistantMessage.id,
            );
            this.currentTasks = [];
            this.currentRun = null;
            this.loading = false;
            if (error?.payload?.code === 'WEB_SEARCH_UNSUPPORTED_MODEL') {
              this.messages = this.messages.filter(
                (m) => m.id !== optimisticMessage.id,
              );
              this.confirmDialogService.confirm({
                title: 'Web Search Unsupported',
                message:
                  error.payload.error ||
                  'The selected model does not support native web search.',
                type: 'warning',
                confirmText: 'Got it',
                hideCancel: true,
              });
            } else if (
              error?.payload?.code === 'DATABASE_CONNECTION_UNAVAILABLE'
            ) {
              // DO NOT filter optimisticMessage. Leave it in the UI!
              this._pendingRetryMessageId = optimisticMessage.id;
              this._pendingRetryContent = trimmed;
              this._pendingRetryWebSearch = webSearch;
              this._pendingRetryResearchDepth = researchDepth;

              this.failedDbConnections = error.payload.connections || [];

              // Immediately reflect the failure in the local list so the
              // attachment panel shows "Failed" without needing navigation.
              const failedIds = new Set(
                this.failedDbConnections.map((fc: any) => String(fc.id)),
              );
              this.databaseConnections = this.databaseConnections.map((db) =>
                failedIds.has(String(db.id)) ? { ...db, status: 'failed' } : db,
              );
              // Invalidate cache so the next list() call hits the backend.
              this.dbConnectionService.invalidateListCache();
              this.databaseConnectionsLoaded = false;

              setTimeout(() => {
                this.showConnectionWarningModal = true;
                this.cdr.detectChanges();
              });
            } else {
              this.messages = this.messages.filter(
                (m) => m.id !== optimisticMessage.id,
              );
              this.handleError('Failed to send message', error);
            }
          },
          complete: () => {
            this.loading = false;
            this.currentTasks = [];
          },
        });
    } catch (error) {
      this.messages = this.messages.filter(
        (message) => message.id !== optimisticMessage.id,
      );
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

  async onWebpageAttach(payload: {
    url: string;
    title?: string;
  }): Promise<void> {
    if (!payload?.url?.trim()) {
      return;
    }

    this.attachmentsInProgress = true;
    try {
      const vectorStoreId = await this.resolveUploadVectorStoreId();
      await lastValueFrom(
        this.documentService.ingest({
          s3_file_url: payload.url.trim(),
          vector_store_id: vectorStoreId || undefined,
        }),
      );
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
    if (
      !selection ||
      selection.type === 'clear' ||
      (selection.type === 'library' && !selection.libraryId)
    ) {
      this.selectedLibraryId = null;
      this.selectedDocumentIds = [];
      this.selectedDatabaseConnectionIds = [];
      // this.setAttachmentMessage('Library selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    if (selection.type === 'library') {
      this.selectedLibraryId = selection.libraryId;
      this.selectedDocumentIds = [];
      this.selectedDatabaseConnectionIds = [];
      this.setAttachmentMessage('Library selected for the next reply.');
      this.updateModeFromSelection();
      return;
    }

    this.selectedDocumentIds = (selection.documentIds || []).map((id) =>
      String(id),
    );
    this.selectedDatabaseConnectionIds = (
      selection.databaseConnectionIds || []
    ).map((id) => String(id));
    this.selectedLibraryId = null;

    if (
      !this.selectedDocumentIds.length &&
      !this.selectedDatabaseConnectionIds.length
    ) {
      // this.setAttachmentMessage('Document selection cleared.');
      this.updateModeFromSelection(true);
      return;
    }

    // this.setAttachmentMessage(`${this.selectedDocumentIds.length} document(s) selected for the next reply.`);
    this.updateModeFromSelection();
  }

  onPromptSelected(promptId: string | null): void {
    this.selectedPromptId = promptId;
    this.setAttachmentMessage(
      promptId
        ? 'Prompt selected for the next reply.'
        : 'Prompt selection cleared.',
    );
  }

  onCancelRun(): void {
    if (!this.currentRun || this.currentRun.status !== 'in_progress') {
      return;
    }

    const responseId = this.currentRun.id;
    this.stopStream();

    if (this.currentThread) {
      this.chatStreamService.cancelStream(this.currentThread.id);
    }

    this.loading = false;
    this.currentRun = null;

    // Fallback: Also tell backend to cancel it if it was a real polling request
    if (responseId !== 'pending') {
      this.responseService.cancel(responseId).subscribe({
        next: () => {
          this.stopResponsePolling();
        },
        error: (error) => {
          this.handleError('Failed to cancel response', error);
        },
      });
    } else {
      this.stopResponsePolling();
    }
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
      },
    });
  }

  onThreadRemove(thread: Conversation): void {
    this.conversationService.delete(thread.id).subscribe({
      next: () => {
        this.threads = this.threads.filter((item) => item.id !== thread.id);
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
      },
    });
  }

  @HostListener('document:click', ['$event'])
  closeMenus(event: MouseEvent): void {
    const target = event?.target as HTMLElement;
    if (target && target.closest('.conversation-menu-panel')) {
      return;
    }
    this.closeConversationMenu();
  }

  toggleConversationMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.conversationMenuOpen = !this.conversationMenuOpen;
  }

  closeConversationMenu(): void {
    this.conversationMenuOpen = false;
  }

  togglePin(thread: Conversation, event?: MouseEvent): void {
    event?.stopPropagation();
    this.closeConversationMenu();

    const previousPinnedState = !!thread.is_pinned;
    thread.is_pinned = !previousPinnedState;

    this.conversationService
      .patch(thread.id, { is_pinned: thread.is_pinned })
      .subscribe({
        next: (updatedThread) => {
          thread.is_pinned = updatedThread.is_pinned;
          this.upsertThread(thread);
        },
        error: (err) => {
          console.error('Failed to update pin status', err);
          thread.is_pinned = previousPinnedState;
        },
      });
  }

  async editCurrentThread(
    thread: Conversation,
    event?: MouseEvent,
  ): Promise<void> {
    event?.stopPropagation();
    this.closeConversationMenu();

    const currentTitle = thread.title || 'New Conversation';
    const updatedTitle = await this.confirmDialogService.prompt({
      title: 'Rename Chat',
      message: 'Enter a new title for this conversation:',
      promptValue: currentTitle,
      promptPlaceholder: 'Chat title...',
      confirmText: 'Rename',
      cancelText: 'Cancel',
    });

    if (
      updatedTitle &&
      updatedTitle.trim() &&
      updatedTitle.trim() !== currentTitle
    ) {
      this.onThreadRename({ thread, title: updatedTitle.trim() });
    }
  }

  toggleDataGrid(thread: Conversation, event?: MouseEvent): void {
    event?.stopPropagation();

    const previousState = !!thread.enable_data_grid;
    thread.enable_data_grid = !previousState;

    this.conversationService
      .patch(thread.id, { enable_data_grid: thread.enable_data_grid })
      .subscribe({
        next: (updatedThread) => {
          thread.enable_data_grid = updatedThread.enable_data_grid;
          this.upsertThread(thread);
        },
        error: (err) => {
          console.error('Failed to update data grid toggle status', err);
          thread.enable_data_grid = previousState;
        },
      });
  }

  exportConversation(format: ExportFormat, event?: MouseEvent): void {
    event?.stopPropagation();
    this.closeConversationMenu();
    if (!this.currentThread) {
      return;
    }
    if (!this.messages || this.messages.length === 0) {
      this.toast.info(
        'Nothing to export',
        'This conversation has no messages yet.',
      );
      return;
    }
    try {
      this.exportService.export(this.currentThread, this.messages, format);
      this.toast.success(
        'Export ready',
        `Conversation downloaded as ${format.toUpperCase()}.`,
      );
    } catch (err) {
      console.error('Failed to export conversation', err);
      this.toast.error(
        'Export failed',
        'Could not generate the download. Please try again.',
      );
    }
  }

  async deleteCurrentThread(
    thread: Conversation,
    event?: MouseEvent,
  ): Promise<void> {
    event?.stopPropagation();
    this.closeConversationMenu();

    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete chat?',
      message: 'This will delete',
      itemName: thread.title || 'this conversation',
    });

    if (confirmed) {
      this.chatStreamService.cancelStream(thread.id);
      this.onThreadRemove(thread);
    }
  }

  onWorkspaceNavigate(): void {
    this.router.navigate(['/workspace']);
  }

  logout(): void {
    this.chatStreamService.clearAllStreams();
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
        },
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
    this.databaseConnectionsLoaded = false;
    this.databaseConnectionsLoading = false;
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
      this.chatStreamService.setActiveThreadId(null);
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
    const shuffled = [...this.allDefaultQuestions].sort(
      () => 0.5 - Math.random(),
    );
    this.defaultQuestions = shuffled.slice(0, 5);
  }

  private loadThreads(): void {
    if (this.threadsLoading) {
      return;
    }

    this.threadsLoading = true;
    this.conversationService.list().subscribe({
      next: (threads) => {
        this.threads = this.sortThreads(threads || []).filter(
          (thread) => !thread.is_temporary,
        );
        this.threadsLoaded = true;
        this.threadsLoading = false;

        if (this.pendingThreadId && !this.currentThread) {
          this.loadThread(this.pendingThreadId);
        }
      },
      error: (error) => {
        this.threadsLoading = false;
        console.error('Error loading conversations:', error);
      },
    });
  }

  private loadThread(threadId: string): void {
    this.stopResponsePolling();
    this.stopStream();
    this.currentRun = null;
    this.loading = false;
    this.selectedLibraryId = null;
    this.selectedDocumentIds = [];
    this.selectedPromptId = null;
    this.attachmentMessage = '';
    this.updateModeFromSelection(true);
    this.datagridAttachmentService.clearAttachment();

    const existingThread = this.threads.find(
      (thread) => thread.id === threadId,
    );

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
      },
    });
  }

  private loadMessages(threadId: string): void {
    this.ensureDocumentsLoaded();
    this.conversationService.getMessages(threadId).subscribe({
      next: (messages) => {
        if (
          this.currentThread?.id !== threadId &&
          this.pendingThreadId !== threadId
        ) {
          return;
        }
        const ephemeral = this.ephemeralMetadataMap.get(String(threadId));
        if (ephemeral && messages && messages.length > 0) {
          // Find the last assistant message
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
              messages[i].metadata = {
                ...(messages[i].metadata || {}),
                ...ephemeral,
              };
              break;
            }
          }
        }
        this.messages = this.decorateMessagesWithAttachments(messages || []);
        this.updateTokenUsage();
        this.reconnectToStream(threadId);
      },
      error: (error) => {
        console.error('Error loading conversation messages:', error);
      },
    });
  }

  private reconnectToStream(threadId: string): void {
    const streamState = this.chatStreamService.getStreamState(threadId);
    if (!streamState) {
      return;
    }

    if (streamState.runStatus === 'in_progress') {
      const userMsgExists = this.messages.some(
        (m) =>
          m.id === streamState.userMessage.id ||
          (m.role === 'user' && m.content === streamState.userMessage.content),
      );
      if (!userMsgExists) {
        this.messages = [...this.messages, streamState.userMessage];
      }

      const assistantMsgExists = this.messages.some(
        (m) => m.id === streamState.assistantMessage.id,
      );
      if (!assistantMsgExists) {
        this.messages = [...this.messages, streamState.assistantMessage];
      }

      this.loading = true;
      // Restore task list state from the service (events fired before reconnect are not replayed)
      this.currentTasks = [...(streamState.currentTasks || [])];
      this.currentRun = {
        id: 'pending',
        conversation: threadId,
        status: 'in_progress',
        model: this.selectedModel || this.responseService.getDefaultModel(),
        instructions: '',
        input_messages: [],
        output: [],
        metadata: {},
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      this.stopStream();
      this.streamSub = streamState.eventSubject.subscribe({
        next: (event: StreamEvent) => {
          if (event.type === 'delta' && event.delta) {
            // Create new object reference for the streaming message so OnPush detects it.
            const lastIdx = this.messages.length - 1;
            this.messages = [
              ...this.messages.slice(0, lastIdx),
              { ...streamState.assistantMessage },
            ];
            // Hide task list once text starts streaming
            if (this.currentTasks.length > 0) {
              this.currentTasks = [];
            }
          } else if (event.type === 'task_update') {
            this.currentTasks = (event.tasks || []).filter(
              (t) => t.status !== 'removed',
            );
          } else if (event.type === 'completed') {
            this.currentTasks = [];
            this.applyWarnings(event.warnings);
            const outMetadata = event.response?.output?.[0]?.metadata;
            if (outMetadata) {
              this.ephemeralMetadataMap.set(String(threadId), outMetadata);
            }
            this.finalizeResponse(event.response!, threadId);
          } else if (event.type === 'failed') {
            this.currentTasks = [];
            this.messages = this.messages.filter(
              (m) => m.id !== streamState.assistantMessage.id,
            );
            this.messages = this.messages.filter(
              (m) => m.id !== streamState.userMessage.id,
            );
            this.currentRun = null;
            this.loading = false;
            this.handleError(
              event.response?.error_message || 'Response failed',
              event.response,
            );
          }
        },
        error: (error) => {
          this.messages = this.messages.filter(
            (m) => m.id !== streamState.assistantMessage.id,
          );
          this.messages = this.messages.filter(
            (m) => m.id !== streamState.userMessage.id,
          );
          this.currentTasks = [];
          this.currentRun = null;
          this.loading = false;
          if (error?.payload?.code === 'WEB_SEARCH_UNSUPPORTED_MODEL') {
            this.messages = this.messages.filter(
              (m) => m.id !== streamState.userMessage.id,
            );
            this.confirmDialogService.confirm({
              title: 'Web Search Unsupported',
              message:
                error.payload.error ||
                'The selected model does not support native web search.',
              type: 'warning',
              confirmText: 'Got it',
              hideCancel: true,
            });
          } else if (
            error?.payload?.code === 'DATABASE_CONNECTION_UNAVAILABLE'
          ) {
            this._pendingRetryMessageId = streamState.userMessage.id;
            this._pendingRetryContent = streamState.userMessage.content;
            this._pendingRetryWebSearch = this._lastMessageWebSearch;
            this._pendingRetryResearchDepth = this._lastMessageResearchDepth;

            this.failedDbConnections = error.payload.connections || [];
            setTimeout(() => {
              this.showConnectionWarningModal = true;
              this.cdr.detectChanges();
            });
          } else {
            this.messages = this.messages.filter(
              (m) => m.id !== streamState.userMessage.id,
            );
            this.handleError('Failed to send message', error);
          }
        },
        complete: () => {
          this.loading = false;
          this.currentTasks = [];
        },
      });
    } else if (streamState.runStatus === 'completed') {
      this.chatStreamService.clearStreamState(threadId);
    } else if (streamState.runStatus === 'failed') {
      this.handleError(streamState.error || 'Response failed');
      this.chatStreamService.clearStreamState(threadId);
    }
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

  private ensureDatabaseConnectionsLoaded(): void {
    if (this.databaseConnectionsLoaded || this.databaseConnectionsLoading) {
      return;
    }
    this.loadDatabaseConnections();
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
      },
    });
  }

  private loadPrompts(): Promise<void> {
    if (this.promptsLoading) {
      return this.promptsLoadingPromise || Promise.resolve();
    }

    this.promptsLoading = true;
    const request = lastValueFrom(this.assistantService.list())
      .then((prompts) => {
        this.prompts = prompts || [];
        this.promptsLoaded = true;
      })
      .catch((error) => {
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

  private loadDatabaseConnections(): void {
    if (this.databaseConnectionsLoading) {
      return;
    }

    this.databaseConnectionsLoading = true;
    Promise.all([
      lastValueFrom(this.dbConnectionService.list().pipe(catchError(() => of([])))),
      lastValueFrom(this.connectionShareService.listSharedWithMe().pipe(catchError(() => of([])))),
    ]).then(([connections, sharedWithMe]) => {
      const ownedConnections = connections || [];
      const sharedConnections = ConnectionShareService.mapToDatabaseConnections(sharedWithMe || []);
      const deduped = new Map<string, DatabaseConnection>();

      [...ownedConnections, ...sharedConnections].forEach((conn) => {
        if (conn.id) {
          deduped.set(conn.id, conn);
        }
      });

      this.databaseConnections = Array.from(deduped.values());
      this.databaseConnectionsLoaded = true;
      this.databaseConnectionsLoading = false;
    }).catch(error => {
      this.databaseConnectionsLoading = false;
      console.error('Error loading database connections:', error);
    });
  }

  loadDocuments(): void {
    if (this.documentsLoading) {
      return;
    }

    this.documentsLoading = true;
    Promise.all([
      lastValueFrom(this.documentService.list(undefined, true)),
      lastValueFrom(this.documentShareService.listSharedWithMe()),
    ])
      .then(([documents, sharedWithMe]) => {
        const ownedDocuments = documents || [];
        const sharedDocuments = this.mapSharedDocuments(sharedWithMe || []);
        const deduped = new Map<string, Document>();

        [...ownedDocuments, ...sharedDocuments].forEach((document) => {
          deduped.set(document.id, document);
        });

        this.allDocuments = Array.from(deduped.values());
        this.documentsLoaded = true;
        this.documentsLoading = false;
        if (this.messages.length) {
          this.messages = this.decorateMessagesWithAttachments(this.messages);
        }
      })
      .catch((error) => {
        this.documentsLoading = false;
        console.error('Error loading documents:', error);
      });
  }

  private async ensureConversation(
    firstMessage: string,
  ): Promise<Conversation> {
    if (this.currentThread) {
      return this.currentThread;
    }

    const payload: ConversationCreateRequest = {
      title: this.buildConversationTitle(firstMessage),
      is_temporary: false,
    };

    const thread = await lastValueFrom(
      this.conversationService.create(payload),
    );
    this.currentThread = thread;
    this.pendingThreadId = thread.id;
    this.upsertThread(thread);
    this.location.replaceState(`/home/chat/${thread.id}`);
    return thread;
  }

  private async buildResponseRequest(
    content: string,
    conversationId: string,
    webSearch: boolean = false,
    researchDepth: ResearchDepth = 'normal',
  ): Promise<ResponseCreateRequest> {
    await this.ensurePromptsLoaded();

    const prompt = this.prompts.find(
      (item) => item.id === this.selectedPromptId,
    );
    const model =
      prompt?.model ||
      this.selectedModel ||
      this.responseService.getDefaultModel();
    const instructions = this.buildInstructions(prompt);
    const tools = this.buildTools();

    const attachedConnectors = this.getAttachedConnectorsByIds(
      this.selectedDatabaseConnectionIds,
    );
    const attachedGrid = this.datagridAttachmentService.getCurrentAttachment();

    return {
      conversation: conversationId,
      model,
      instructions,
      web_search: webSearch,
      research_depth: researchDepth,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: content }],
        },
      ],
      tools,
      db_connection_ids: this.selectedDatabaseConnectionIds.length
        ? [...this.selectedDatabaseConnectionIds]
        : undefined,
      metadata: {
        mode: this.mode,
        ...(attachedConnectors.length
          ? { attached_connectors: attachedConnectors }
          : {}),
        ...(attachedGrid ? { attached_datagrid: attachedGrid } : {}),
      },
    };
  }

  private buildInstructions(prompt?: Assistant): string | undefined {
    const instructionParts: string[] = [];

    if (prompt?.instructions?.trim()) {
      instructionParts.push(prompt.instructions.trim());
    }

    if (this.mode === 'web') {
      instructionParts.push(
        'Use broad web-style reasoning and state uncertainty clearly when context is limited.',
      );
    }

    // NOTE: DataGrid context instructions are now generated server-side by the backend
    // (ResponsesAPIView) when datagrid_id is present in the request. The backend produces
    // a richer instruction that includes column names, row count, and source info.
    // Do NOT inject a [System Context] DataGrid instruction here.

    return instructionParts.length ? instructionParts.join('\n\n') : undefined;
  }

  private buildTools(): Tool[] | undefined {
    const tools: Tool[] = [];

    // ── Document tool ──
    const vectorStoreIds = new Set<string>();
    if (this.selectedLibraryId) {
      vectorStoreIds.add(this.selectedLibraryId);
    }
    if (this.selectedDocumentIds.length) {
      this.allDocuments
        .filter((document) => this.selectedDocumentIds.includes(document.id))
        .forEach((document) => vectorStoreIds.add(document.vector_store));
    }
    const normalizedVectorStoreIds = Array.from(vectorStoreIds).filter(Boolean);
    if (normalizedVectorStoreIds.length) {
      const docTool: DocumentTool = {
        type: 'document',
        vector_store_ids: normalizedVectorStoreIds,
      };
      if (this.selectedDocumentIds.length) {
        docTool.document_ids = [...this.selectedDocumentIds];
      }
      tools.push(docTool);
    }

    // ── DataGrid tool ──
    // When a DataGrid is attached the backend validates ownership, injects the
    // query_datagrid function tool, and appends column/schema instructions.
    const attachedGrid = this.datagridAttachmentService.getCurrentAttachment();
    if (attachedGrid) {
      tools.push({
        type: 'datagrid',
        datagrid_id: attachedGrid.id,
      } as DataGridTool);
    }

    return tools.length ? tools : undefined;
  }

  private startResponsePolling(
    responseId: string,
    threadId: string,
    optimisticMessageId: string,
  ): void {
    this.stopResponsePolling();
    this.responsePollSub = this.responseService
      .pollResponseStatus(responseId)
      .subscribe({
        next: async (response) => {
          if (!response) {
            return;
          }

          this.currentRun = response;
          this.applyWarnings(response.warnings);

          if (response.status === 'completed') {
            const outMetadata = response.output?.[0]?.metadata;
            if (outMetadata) {
              this.ephemeralMetadataMap.set(String(threadId), outMetadata);
            }
            await this.finalizeResponse(response, threadId);
            this.stopResponsePolling();
            return;
          }

          if (response.status === 'failed' || response.status === 'cancelled') {
            this.loading = false;
            this.currentRun = null;
            this.messages = this.messages.filter(
              (message) => message.id !== optimisticMessageId,
            );
            this.handleError(
              response.error_message || 'Response failed',
              response,
            );
            this.stopResponsePolling();
          }
        },
        error: (error) => {
          this.loading = false;
          this.currentRun = null;
          this.stopResponsePolling();
          this.handleError('Failed while waiting for the response', error);
        },
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

  private async finalizeResponse(
    response: ResponseRecord,
    threadId: string,
  ): Promise<void> {
    this.chatStreamService.clearStreamState(threadId);
    this.loading = false;
    this.currentRun = null;
    this.applyWarnings(response.warnings);
    this.responseAttentionService.notifyResponseReady(
      'Home chat response ready',
      response.output?.[0]?.content?.[0]?.text,
    );
    // Fire both requests in parallel — thread metadata and messages are independent.
    this.loadMessages(threadId);
    await this.refreshThread(threadId);
  }

  private async refreshThread(threadId: string): Promise<void> {
    try {
      const thread = await lastValueFrom(
        this.conversationService.getById(threadId),
      );
      this.upsertThread(thread);
      if (this.currentThread?.id === thread.id) {
        this.currentThread = thread;
      }
    } catch (error) {
      console.error('Unable to refresh conversation metadata', error);
    }
  }

  /**
   * Finds the most recent assistant message that carries a `usage` payload
   * and stores it in currentTokenUsage (drives the chatbar token ring).
   */
  private updateTokenUsage(): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === 'assistant' && msg.usage) {
        this.currentTokenUsage = msg.usage;
        return;
      }
    }
    this.currentTokenUsage = null;
  }

  private async resolveUploadVectorStoreId(): Promise<string | null> {
    if (!this.librariesLoaded) {
      this.ensureLibrariesLoaded();
      if (this.librariesLoading) {
        this.libraries =
          (await lastValueFrom(this.vectorStoreService.list())) || [];
        this.librariesLoaded = true;
      }
    }

    if (this.selectedLibraryId) {
      return this.selectedLibraryId;
    }

    const defaultLibrary = this.libraries.find(
      (library) => library.vs_type === 'DEFAULT',
    );
    if (defaultLibrary) {
      return defaultLibrary.id;
    }

    const firstWritableLibrary = this.libraries.find(
      (library) => library.vs_type !== 'SHARED',
    );
    return firstWritableLibrary?.id || null;
  }

  private mapSharedDocuments(items: SharedWithMeItem[]): Document[] {
    const sharedLibraryId =
      this.libraries.find((library) => library.vs_type === 'SHARED')?.id ||
      'shared';

    return items.map((item) => ({
      id: item.document_id,
      title: item.document_title,
      original_filename: item.document_title,
      vector_store: sharedLibraryId,
      user: item.owner_email,
      uploaded_at: item.shared_at,
      created_at: item.shared_at,
      updated_at: item.updated_at || item.shared_at,
      status: 'completed',
      ingestion_status: 'completed',
      access_type: 'shared',
      source: 'LOCAL',
      metadata: item.expires_at ? { expires_at: item.expires_at } : undefined,
    }));
  }

  private async uploadFiles(
    files: File[],
    vectorStoreId: string | null,
  ): Promise<void> {
    if (!files.length) {
      return;
    }

    this.attachmentsInProgress = true;
    try {
      await lastValueFrom(
        this.documentService.ingest({
          files,
          vector_store_id: vectorStoreId || undefined,
        }),
      );

      this.setAttachmentMessage(
        `Attached ${files.length} item(s) successfully.`,
      );
      this.loadDocuments();
    } catch (error) {
      this.setAttachmentMessage('Failed to upload files.');
      console.error('Error uploading files:', error);
    } finally {
      this.attachmentsInProgress = false;
    }
  }

  private buildLocalMessage(
    role: 'user' | 'assistant',
    content: string,
  ): ConversationMessage {
    const attachedDocuments =
      role === 'user'
        ? this.getAttachedDocumentsByIds(this.selectedDocumentIds)
        : [];
    const attachedConnectors =
      role === 'user'
        ? this.getAttachedConnectorsByIds(this.selectedDatabaseConnectionIds)
        : [];
    const attachedGrid =
      role === 'user'
        ? this.datagridAttachmentService.getCurrentAttachment()
        : null;

    const metadata: Record<string, any> = {};
    if (attachedDocuments.length)
      metadata['attached_documents'] = attachedDocuments;
    if (attachedConnectors.length)
      metadata['attached_connectors'] = attachedConnectors;
    if (attachedGrid) metadata['attached_datagrid'] = attachedGrid;

    return {
      id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      created_at: new Date().toISOString(),
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };
  }

  private decorateMessagesWithAttachments(
    messages: ConversationMessage[],
  ): ConversationMessage[] {
    return messages.map((message, index) => {
      if (message.role !== 'user') {
        return message;
      }

      const newMeta: Record<string, any> = { ...(message.metadata || {}) };

      // Documents
      if (!newMeta['attached_documents']) {
        const documentIds = this.getPersistedDocumentIdsForMessage(
          message,
          messages[index + 1],
        );
        const attachedDocuments = this.getAttachedDocumentsByIds(documentIds);
        if (attachedDocuments.length) {
          newMeta['attached_documents'] = attachedDocuments;
        }
      }

      // Connectors
      if (!newMeta['attached_connectors']) {
        const assistantMeta = messages[index + 1]?.metadata || {};

        // 1. Check if the full attached_connectors array was persisted in the assistant's metadata
        if (Array.isArray(assistantMeta['attached_connectors'])) {
          newMeta['attached_connectors'] = assistantMeta['attached_connectors'];
        }
        // 2. Otherwise check for raw db_connection_ids and re-hydrate
        else {
          const connectorIds =
            this.extractConnectorIdsFromMetadata(message.metadata) ||
            this.extractConnectorIdsFromMetadata(assistantMeta);

          if (connectorIds && connectorIds.length) {
            const connectors = this.getAttachedConnectorsByIds(connectorIds);
            if (connectors.length) {
              newMeta['attached_connectors'] = connectors;
            }
          }
        }
      }

      // DataGrid — hydrate from the assistant response's metadata if not already in user message
      if (!newMeta['attached_datagrid']) {
        const assistantMeta = messages[index + 1]?.metadata || {};
        const persistedGrid =
          assistantMeta['attached_datagrid'] ||
          message.metadata?.['attached_datagrid'];
        if (persistedGrid && typeof persistedGrid === 'object') {
          newMeta['attached_datagrid'] = persistedGrid;
        }
      }

      if (
        Object.keys(newMeta).length ===
          Object.keys(message.metadata || {}).length &&
        JSON.stringify(newMeta) === JSON.stringify(message.metadata || {})
      ) {
        return message;
      }

      return { ...message, metadata: newMeta };
    });
  }

  private extractConnectorIdsFromMetadata(
    metadata?: Record<string, any>,
  ): string[] | null {
    if (!metadata) return null;
    if (Array.isArray(metadata['db_connection_ids']))
      return metadata['db_connection_ids'];
    if (Array.isArray(metadata['used_db_connection_ids']))
      return metadata['used_db_connection_ids'];
    return null;
  }

  private getPersistedDocumentIdsForMessage(
    message: ConversationMessage,
    nextMessage?: ConversationMessage,
  ): string[] {
    const directIds = this.extractDocumentIdsFromMetadata(message.metadata);
    if (directIds.length) {
      return directIds;
    }

    if (nextMessage?.role === 'assistant') {
      return this.extractDocumentIdsFromMetadata(nextMessage.metadata);
    }

    return [];
  }

  private extractDocumentIdsFromMetadata(
    metadata?: Record<string, any>,
  ): string[] {
    if (!metadata) {
      return [];
    }

    const directIds = metadata['document_ids'];
    if (Array.isArray(directIds)) {
      return directIds.map((id) => String(id)).filter(Boolean);
    }

    const usedIds = metadata['used_document_ids'];
    if (Array.isArray(usedIds)) {
      return usedIds.map((id) => String(id)).filter(Boolean);
    }

    const tools = metadata['tools'];
    if (!Array.isArray(tools)) {
      return [];
    }

    const ids = tools.flatMap((tool) =>
      Array.isArray(tool?.document_ids) ? tool.document_ids : [],
    );
    return ids.map((id) => String(id)).filter(Boolean);
  }

  private getAttachedDocumentsByIds(
    documentIds: string[],
  ): Array<{ id: string; name: string }> {
    if (!documentIds.length) {
      return [];
    }

    const selectedIds = new Set(documentIds.map((id) => String(id)));
    return this.allDocuments
      .filter((document) => selectedIds.has(String(document.id)))
      .map((document) => ({
        id: String(document.id),
        name:
          document.title ||
          document.original_filename ||
          `Document ${document.id}`,
      }));
  }

  private getAttachedConnectorsByIds(
    connectorIds: string[],
  ): Array<{ id: string; name: string; type: string }> {
    if (!connectorIds.length) {
      return [];
    }
    const selectedIds = new Set(connectorIds.map((id) => String(id)));
    return this.databaseConnections
      .filter((conn) => conn.id && selectedIds.has(String(conn.id)))
      .map((conn) => ({
        id: String(conn.id),
        name: conn.name || conn.database_name || `Connection ${conn.id}`,
        type:
          conn.connection_type?.name ||
          conn.connection_type?.driver_name ||
          'Database',
      }));
  }

  private buildConversationTitle(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.length <= 60
      ? normalized
      : `${normalized.slice(0, 57)}...`;
  }

  private updateModeFromSelection(forceNormal = false): void {
    if (
      forceNormal &&
      !this.selectedLibraryId &&
      !this.selectedDocumentIds.length
    ) {
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
      const leftTimestamp = new Date(
        left.updated_at || left.created_at,
      ).getTime();
      const rightTimestamp = new Date(
        right.updated_at || right.created_at,
      ).getTime();
      return rightTimestamp - leftTimestamp;
    });
  }

  private upsertThread(thread: Conversation): void {
    if (thread.is_temporary) {
      return;
    }

    const existingIndex = this.threads.findIndex(
      (item) => item.id === thread.id,
    );
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

  // ── Connection-warning modal handlers ────────────────────────────────────

  onConnectionWarningRetry(): void {
    this.showConnectionWarningModal = false;
    // Invalidate cache so the retry picks up the latest connection state
    this.dbConnectionService.invalidateListCache();
    this.databaseConnectionsLoaded = false;
    if (this._pendingRetryMessageId && this._pendingRetryContent) {
      // Remove the failed message bubble right before retrying so we don't duplicate
      this.messages = this.messages.filter(
        (m) => m.id !== this._pendingRetryMessageId,
      );
      const contentToRetry = this._pendingRetryContent;
      const webSearchToRetry = this._pendingRetryWebSearch;
      const researchDepthToRetry = this._pendingRetryResearchDepth;

      this._pendingRetryMessageId = null;
      this._pendingRetryContent = null;
      this._pendingRetryWebSearch = false;
      this._pendingRetryResearchDepth = 'normal';

      this.onMessageSent({
        content: contentToRetry,
        webSearch: webSearchToRetry,
        researchDepth: researchDepthToRetry,
      });
    }
  }

  onConnectionWarningEdit(connectionId: string): void {
    this.showConnectionWarningModal = false;
    this.router.navigate(['/connectors', connectionId]);
  }

  onConnectionWarningDismiss(): void {
    this.showConnectionWarningModal = false;
    if (this._pendingRetryMessageId && this._pendingRetryContent) {
      // User cancelled, so remove the stuck message bubble and put the text back in the input box
      this.messages = this.messages.filter(
        (m) => m.id !== this._pendingRetryMessageId,
      );
      this.chatInput?.updateInput(this._pendingRetryContent);

      this._pendingRetryMessageId = null;
      this._pendingRetryContent = null;
      this._pendingRetryWebSearch = false;
      this._pendingRetryResearchDepth = 'normal';
    }
  }

  // ── Error display ─────────────────────────────────────────────────────────

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
    this.warningMessages = (warnings || []).filter(
      (warning) =>
        !!warning && warning.trim() !== 'Served from semantic cache.',
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
