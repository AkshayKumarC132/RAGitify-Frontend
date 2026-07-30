import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, HostListener, ChangeDetectorRef } from '@angular/core';
import { Subscription, lastValueFrom } from 'rxjs';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { SharedWithMeItem } from '../../../shared/models/document-share.model';
import { ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, StreamEvent, TaskItem } from '../../../shared/models/response.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection, FailedConnectionInfo } from '../../../shared/models/database-connection.model';
import { Router } from '@angular/router';
import { ChatInputComponent, LibrarySelectionEvent } from '../chat-input/chat-input.component';
import { ConnectionSyncService } from '../../../shared/services/connection-sync.service';

@Component({
    selector: 'app-playground',
    templateUrl: './playground.component.html',
    styleUrls: ['./playground.component.scss']
})
export class PlaygroundComponent implements OnInit, OnDestroy, AfterViewInit {
    private readonly maxSelectedDocuments = 10;

    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @ViewChild(ChatInputComponent) chatInput?: ChatInputComponent;
    @Output() closed = new EventEmitter<void>();

    messages: ConversationMessage[] = [];
    currentTasks: TaskItem[] = [];
    conversationId: string | null = null;
    loading = false;
    inputMessage = '';
    errorMessage = '';
    warningMessages: string[] = [];
    mode: 'normal' | 'web' | 'document' = 'normal';
    isExpanded = false;
    isOverflowing = false;
    private streamSub?: Subscription;

    libraries: VectorStore[] = [];
    allDocuments: Document[] = [];
    libraryPanelOpen = false;
    activeDocumentTab: 'my' | 'shared' | 'database' = 'my';
    selectedDocumentIds: string[] = [];
    selectedDatabaseConnectionIds: string[] = [];
    pendingDocumentIds = new Set<string>();
    pendingDatabaseConnectionIds = new Set<string>();
    expandedLibraries = new Set<string>();
    documentSearchQuery = '';
    librariesLoaded = false;
    librariesLoading = false;
    documentsLoaded = false;
    documentsLoading = false;
    databaseConnections: DatabaseConnection[] = [];
    databaseConnectionsLoaded = false;
    databaseConnectionsLoading = false;
    showConnectionWarningModal = false;
    failedDbConnections: FailedConnectionInfo[] = [];
    private _pendingRetryMessageId: string | null = null;
    private _pendingRetryContent: string | null = null;
    private _lastSentMessage = '';

    /** Returns ALL database connections, not just connected ones. */
    get allDatabaseConnections(): DatabaseConnection[] {
        return this.databaseConnections || [];
    }

    /** Returns true when the connection is in a failed/error state. */
    isConnectionFailed(db: DatabaseConnection): boolean {
        const s = (db.status || '').toLowerCase();
        return s === 'failed' || s === 'error';
    }

    isConnectionSyncing(db: DatabaseConnection): boolean {
        return !!db.id && this.connectionSyncService.isSyncing(db.id);
    }

    /** Human-readable status label shown as the badge. */
    getConnectionStatusLabel(db: DatabaseConnection): string {
        if (this.isConnectionSyncing(db)) return 'Syncing...';
        const s = (db.status || '').toLowerCase();
        if (s === 'connected' || s === 'success') return 'Connected';
        if (s === 'failed'    || s === 'error')   return 'Failed';
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
            'badge-syncing':   isSyncing,
            'badge-blue':      !isSyncing && (!s || (s !== 'connected' && s !== 'success' && s !== 'failed' && s !== 'error' && s !== 'pending')),
        };
    }

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
        'What are the main insights?',
        'Analyze themes across documents',
        'Key takeaways from attachments'
    ];

    get showTaskList(): boolean {
        if (!this.loading) {
            return false;
        }

        const lastMessage = this.messages[this.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            return true;
        }

        return !lastMessage.content;
    }

    get suggestedQuestions(): string[] {
        return this.mode === 'document' ? this.documentQuestions : this.defaultQuestions;
    }

    get selectionCount(): number {
        return this.selectedDocumentIds.length + this.selectedDatabaseConnectionIds.length;
    }

    get selectionLabel(): string {
        if (!this.selectionCount) {
            return '';
        }
        return `${this.selectionCount} item(s) selected`;
    }

    get selectedDocuments(): Document[] {
        const ids = new Set(this.selectedDocumentIds.map(String));
        return this.allDocuments.filter(document => ids.has(String(document.id)));
    }

    get availableDocuments(): Document[] {
        const query = this.documentSearchQuery.trim().toLowerCase();
        return (this.allDocuments || []).filter(document => {
            if (this.getDocumentStatus(document) === 'failed') {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                document.title,
                document.original_filename,
                document.file_type,
                document.id
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(query);
        });
    }

    constructor(
        private conversationService: ConversationService,
        private responseService: ResponseService,
        private responseAttentionService: ResponseAttentionService,
        private vectorStoreService: VectorStoreService,
        private documentService: DocumentService,
        private documentShareService: DocumentShareService,
        private dbConnectionService: DatabaseConnectionService,
        private connectionSyncService: ConnectionSyncService,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.shuffleDefaultQuestions();
        this.createTemporaryConversation();
    }

    ngOnDestroy(): void {
        this.stopStream();
        this.cleanupConversation();
    }

    ngAfterViewInit(): void {
        this.scrollToBottom();
    }

    onQuestionClick(question: string): void {
        this.inputMessage = question;
        this.chatInput?.updateInput(question);
    }

    onMessageSent(event: { content: string; webSearch: boolean } | string): void {
        const text = typeof event === 'string' ? event : event.content;
        if (!text || !text.trim() || this.loading || !this.conversationId) return;

        this.inputMessage = text.trim();
        this.sendMessage();
    }

    onLibrarySelected(event: LibrarySelectionEvent): void {
        if (event.type === 'clear') {
            this.selectedDocumentIds = [];
            this.selectedDatabaseConnectionIds = [];
            this.mode = 'normal';
        } else if (event.type === 'documents') {
            this.selectedDocumentIds = event.documentIds;
            this.selectedDatabaseConnectionIds = event.databaseConnectionIds || [];
            this.mode = (this.selectedDocumentIds.length > 0 || this.selectedDatabaseConnectionIds.length > 0) ? 'document' : 'normal';
        }
    }

    onAttachmentPanelOpened(panel: 'web' | 'notes' | 'library' | null): void {
        if (panel === 'library') {
            this.loadLibraries();
            this.loadDocuments();
            this.loadDatabaseConnections();
        }
    }

    onModeToggle(newMode: 'normal' | 'web' | 'document'): void {
        this.mode = newMode;
    }

    getDocumentDisplayName(document: Document): string {
        return document.title || document.original_filename || `Document ${document.id}`;
    }

    getDocumentStatus(document: Document): string {
        return document.ingestion_status || document.status || 'completed';
    }

    sendMessage(): void {
        if (!this.inputMessage.trim() || this.loading || !this.conversationId) return;

        const content = this.inputMessage.trim();
        const attachedDocuments = this.selectedDocuments.map(document => ({
            id: String(document.id),
            name: this.getDocumentDisplayName(document)
        }));
        this._lastSentMessage = content;
        this.inputMessage = '';
        this.isExpanded = false;
        this.loading = true;

        const tempMsg: ConversationMessage = {
            id: 'temp-' + Date.now(),
            role: 'user',
            content: content,
            created_at: new Date().toISOString(),
            metadata: attachedDocuments.length ? {
                attached_documents: attachedDocuments
            } : undefined
        };
        this.messages.push(tempMsg);
        this.scrollToBottom();

        const request: ResponseCreateRequest = {
            conversation: this.conversationId,
            model: this.responseService.getDefaultModel(),
            input: [{
                role: 'user',
                content: [{ type: 'input_text', text: content }]
            }],
            db_connection_ids: this.selectedDatabaseConnectionIds.length ? [...this.selectedDatabaseConnectionIds] : undefined
        };

        if (this.mode === 'document' && (this.selectedDocumentIds.length > 0 || this.selectedDatabaseConnectionIds.length > 0)) {
            const vectorStoreIds = Array.from(new Set(
                this.allDocuments
                    .filter(document => this.selectedDocumentIds.includes(document.id))
                    .map(document => String(document.vector_store))
                    .filter(Boolean)
            ));

            if (vectorStoreIds.length > 0) {
                request.tools = [{
                    type: 'document',
                    vector_store_ids: vectorStoreIds,
                    document_ids: [...this.selectedDocumentIds]
                }];
            }
        }

        // Add a placeholder assistant message for streaming
        const assistantMsg: ConversationMessage = {
            id: 'streaming-' + Date.now(),
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString()
        };
        this.messages.push(assistantMsg);
        this.scrollToBottom();

        this.stopStream();
        this.streamSub = this.responseService.createStream(request).subscribe({
            next: (event: StreamEvent) => {
                if (event.type === 'delta' && event.delta) {
                    assistantMsg.content += event.delta;
                    // Create new array + object reference so Angular's change detection
                    // picks up the mutated content and re-renders the message bubble
                    // (mirrors the approach used in home.component.ts via ChatStreamService)
                    const lastIdx = this.messages.length - 1;
                    this.messages = [...this.messages.slice(0, lastIdx), { ...assistantMsg }];
                    if (this.currentTasks.length > 0) {
                        this.currentTasks = [];
                    }
                    this.scrollToBottom();
                } else if (event.type === 'task_update') {
                    this.currentTasks = (event.tasks || []).filter(t => t.status !== 'removed');
                    this.cdr.markForCheck();
                } else if (event.type === 'completed') {
                    this.loading = false;
                    this.currentTasks = [];
                    this.warningMessages = this.filterWarnings(event.warnings);
                    this.responseAttentionService.notifyResponseReady(
                        'Playground response ready',
                        assistantMsg.content
                    );
                    this.scrollToBottom();
                } else if (event.type === 'failed') {
                    this.currentTasks = [];
                    this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                    this.handleError(event.response?.error_message || 'Response failed', null);
                }
            },
            error: (err: any) => {
                this.loading = false;
                this.currentTasks = [];
                this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                if (err?.payload?.code === 'DATABASE_CONNECTION_UNAVAILABLE') {
                    // DO NOT filter the user's message! Leave it in the UI.
                    this._pendingRetryMessageId = tempMsg.id;
                    this._pendingRetryContent = content; // 'content' from earlier in sendMessage
                    this.failedDbConnections = err.payload.connections || [];

                    // Immediately reflect the failure in the local list.
                    const failedIds = new Set(this.failedDbConnections.map((fc: any) => String(fc.id)));
                    this.databaseConnections = this.databaseConnections.map(db =>
                        failedIds.has(String(db.id)) ? { ...db, status: 'failed' } : db
                    );
                    // Invalidate cache so the next list() call hits the backend.
                    this.dbConnectionService.invalidateListCache();
                    this.databaseConnectionsLoaded = false;

                    setTimeout(() => {
                        this.showConnectionWarningModal = true;
                        this.cdr.detectChanges();
                    });
                } else {
                    this.handleError('Failed to send message', err);
                    this.messages = this.messages.filter(m => m.id !== tempMsg.id);
                    this.cdr.detectChanges();
                }
            },
            complete: () => {
                this.currentTasks = [];
                this.loading = false;
            }
        });
    }

    private shuffleDefaultQuestions(): void {
        const shuffled = [...this.allDefaultQuestions].sort(() => 0.5 - Math.random());
        this.defaultQuestions = shuffled.slice(0, 5);
    }

    private loadLibraries(): void {
        if (this.librariesLoaded || this.librariesLoading) {
            return;
        }
        this.librariesLoading = true;
        this.vectorStoreService.list().subscribe({
            next: (libs) => {
                this.libraries = libs;
                this.librariesLoaded = true;
                this.librariesLoading = false;
            },
            error: (err) => {
                console.error('Failed to load libraries', err);
                this.librariesLoaded = false;
                this.librariesLoading = false;
            }
        });
    }

    private loadDocuments(): void {
        if (this.documentsLoaded || this.documentsLoading) {
            return;
        }
        this.documentsLoading = true;
        Promise.all([
            lastValueFrom(this.documentService.list(undefined, true)),
            lastValueFrom(this.documentShareService.listSharedWithMe()),
            this.librariesLoaded ? Promise.resolve(this.libraries) : lastValueFrom(this.vectorStoreService.list())
        ]).then(([documents, sharedWithMe, libraries]) => {
            this.libraries = libraries || [];
            this.librariesLoaded = true;
            const ownedDocuments = documents || [];
            const sharedDocuments = this.mapSharedDocuments(sharedWithMe || []);
            const deduped = new Map<string, Document>();

            [...ownedDocuments, ...sharedDocuments].forEach(document => {
                deduped.set(document.id, document);
            });

            this.allDocuments = Array.from(deduped.values());
            this.documentsLoaded = true;
            this.documentsLoading = false;
        }).catch(err => {
            console.error('Failed to load documents', err);
            this.documentsLoading = false;
        });
    }

    private loadDatabaseConnections(): void {
        if (this.databaseConnectionsLoading || this.databaseConnectionsLoaded) {
            return;
        }

        this.databaseConnectionsLoading = true;
        this.dbConnectionService.list().subscribe({
            next: (connections) => {
                this.databaseConnections = connections || [];
                this.databaseConnectionsLoaded = true;
                this.databaseConnectionsLoading = false;
            },
            error: (error) => {
                this.databaseConnectionsLoading = false;
                console.error('Error loading database connections:', error);
            }
        });
    }

    private createTemporaryConversation(): void {
        this.conversationService.create({ title: 'Play Ground', is_temporary: true }).subscribe({
            next: (conv) => {
                this.conversationId = conv.id;
            },
            error: (err: any) => {
                console.error('Failed to create temporary conversation', err);
                this.errorMessage = 'Failed to initialize playground.';
            }
        });
    }

    private cleanupConversation(): void {
        this.conversationId = null;
        this.stopStream();
    }

    private stopStream(): void {
        if (this.streamSub) {
            this.streamSub.unsubscribe();
            this.streamSub = undefined;
        }
    }

    onConnectionWarningRetry(): void {
        this.showConnectionWarningModal = false;
        // Invalidate cache so the retry picks up the latest connection state
        this.dbConnectionService.invalidateListCache();
        this.databaseConnectionsLoaded = false;
        if (this._pendingRetryMessageId && this._pendingRetryContent) {
            this.messages = this.messages.filter(m => m.id !== this._pendingRetryMessageId);
            const retryContent = this._pendingRetryContent;
            this._pendingRetryMessageId = null;
            this._pendingRetryContent = null;
            // Put it back into the input and trigger send
            this.inputMessage = retryContent;
            this.sendMessage();
        } else {
            this.sendMessage();
        }
    }

    onConnectionWarningEdit(connectionId: string): void {
        this.showConnectionWarningModal = false;
        // In incognito, they shouldn't edit connection strings directly, but we can emit an event or route them
    }

    onConnectionWarningDismiss(): void {
        this.showConnectionWarningModal = false;
        if (this._pendingRetryMessageId && this._pendingRetryContent) {
            this.messages = this.messages.filter(m => m.id !== this._pendingRetryMessageId);
            this.inputMessage = this._pendingRetryContent;
            this._pendingRetryMessageId = null;
            this._pendingRetryContent = null;
            this.chatInput?.updateInput(this.inputMessage);
        }
    }

    private handleError(msg: string, err: any): void {
        this.loading = false;
        this.errorMessage = msg;
        console.error(msg, err);
        setTimeout(() => this.errorMessage = '', 5000);
    }

    private filterWarnings(warnings?: string[]): string[] {
        return (warnings || []).filter(warning =>
            !!warning && warning.trim() !== 'Served from semantic cache.'
        );
    }

    private toggleDocumentSelectionById(documentId: string, selected: boolean): boolean {
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

    private getLibraryName(libraryId: string): string {
        const match = this.libraries.find(library => library.id === libraryId);
        const name = match ? match.name : 'Unknown Library';
        return name.length > 75 ? `${name.slice(0, 75)}...` : name;
    }

    private mapSharedDocuments(items: SharedWithMeItem[]): Document[] {
        const sharedLibraryId = this.libraries.find(library => library.vs_type === 'SHARED')?.id || 'shared';

        return items.map(item => ({
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
            metadata: item.expires_at ? { expires_at: item.expires_at } : undefined
        }));
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer?.nativeElement) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        }, 0);
    }
}
