import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, HostListener, ChangeDetectorRef } from '@angular/core';
import { Subscription, lastValueFrom } from 'rxjs';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, StreamEvent } from '../../../shared/models/response.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';

@Component({
    selector: 'app-playground',
    templateUrl: './playground.component.html',
    styleUrls: ['./playground.component.scss']
})
export class PlaygroundComponent implements OnInit, OnDestroy, AfterViewInit {
    private readonly maxSelectedDocuments = 10;

    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @Output() closed = new EventEmitter<void>();

    messages: ConversationMessage[] = [];
    conversationId: string | null = null;
    loading = false;
    inputMessage = '';
    errorMessage = '';
    warningMessages: string[] = [];
    mode: 'normal' | 'document' = 'normal';
    private streamSub?: Subscription;

    libraries: VectorStore[] = [];
    allDocuments: Document[] = [];
    attachmentMenuOpen = false;
    libraryPanelOpen = false;
    selectedDocumentIds: string[] = [];
    pendingDocumentIds = new Set<string>();
    documentSearchQuery = '';
    librariesLoaded = false;
    private librariesLoading = false;
    documentsLoaded = false;
    documentsLoading = false;

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

    get suggestedQuestions(): string[] {
        return this.mode === 'document' ? this.documentQuestions : this.defaultQuestions;
    }

    get selectionCount(): number {
        return this.selectedDocumentIds.length;
    }

    get selectionLabel(): string {
        if (!this.selectedDocumentIds.length) {
            return '';
        }
        return `${this.selectedDocumentIds.length}/${this.maxSelectedDocuments} documents selected`;
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
    }

    toggleAttachmentMenu(): void {
        this.attachmentMenuOpen = !this.attachmentMenuOpen;
        if (this.attachmentMenuOpen) {
            this.loadLibraries();
            this.loadDocuments();
            this.libraryPanelOpen = false;
        }
    }

    openLibraryPanel(): void {
        this.attachmentMenuOpen = false;
        this.loadLibraries();
        this.loadDocuments();
        this.libraryPanelOpen = true;
        this.pendingDocumentIds = new Set(this.selectedDocumentIds.map(String));
        this.documentSearchQuery = '';
    }

    closePanel(): void {
        this.libraryPanelOpen = false;
        this.documentSearchQuery = '';
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.attachment-controls') && !target.closest('.attachment-panel') && !target.closest('.attachment-menu')) {
            this.attachmentMenuOpen = false;
            this.libraryPanelOpen = false;
            this.documentSearchQuery = '';
        }
    }

    confirmSelection(): void {
        this.selectedDocumentIds = Array.from(this.pendingDocumentIds);
        this.mode = this.selectedDocumentIds.length ? 'document' : 'normal';
        this.libraryPanelOpen = false;
    }

    clearSelection(): void {
        this.selectedDocumentIds = [];
        this.pendingDocumentIds.clear();
        this.mode = 'normal';
        this.libraryPanelOpen = false;
        this.documentSearchQuery = '';
    }

    removeSelectedDocument(id: string, event?: MouseEvent): void {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const next = new Set(this.selectedDocumentIds.map(String));
        next.delete(String(id));
        this.selectedDocumentIds = Array.from(next);
        if (!this.selectedDocumentIds.length) {
            this.mode = 'normal';
        }
    }

    getDocumentsByLibrary(): { libraryId: string; name: string; documents: Document[] }[] {
        const grouping = new Map<string, Document[]>();
        this.availableDocuments.forEach(document => {
            const list = grouping.get(document.vector_store) || [];
            list.push(document);
            grouping.set(document.vector_store, list);
        });

        return Array.from(grouping.entries())
            .map(([libraryId, documents]) => ({
                libraryId,
                name: this.getLibraryName(libraryId),
                documents
            }))
            .filter(group => group.documents.length > 0);
    }

    isDocumentSelected(documentId: string): boolean {
        return this.pendingDocumentIds.has(String(documentId));
    }

    isSelectionDisabled(documentId: string): boolean {
        return !this.isDocumentSelected(documentId) && this.pendingDocumentIds.size >= this.maxSelectedDocuments;
    }

    toggleDocumentSelectionClick(documentId: string, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const isCurrentlySelected = this.pendingDocumentIds.has(String(documentId));
        const newState = !isCurrentlySelected;
        const updated = this.toggleDocumentSelectionById(documentId, newState);
        if (!updated) {
            return;
        }

        const label = event.currentTarget as HTMLElement;
        const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (checkbox) {
            checkbox.checked = newState;
        }
    }

    getDocumentTypeLabel(document: Document): string {
        return (document.file_type || document.original_filename?.split('.').pop() || 'file').toUpperCase();
    }

    getDocumentSourceLabel(document: Document): string {
        return document.access_type === 'shared' ? 'Shared' : 'Owned';
    }

    getDocumentDisplayName(document: Document): string {
        return document.title || document.original_filename || `Document ${document.id}`;
    }

    getDocumentDate(document: Document): string | undefined {
        return document.created_at || document.updated_at || document.uploaded_at;
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
        this.inputMessage = '';
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
            }]
        };

        if (this.mode === 'document' && this.selectedDocumentIds.length > 0) {
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
                    this.scrollToBottom();
                } else if (event.type === 'completed') {
                    this.loading = false;
                    this.warningMessages = this.filterWarnings(event.warnings);
                    this.responseAttentionService.notifyResponseReady(
                        'Playground response ready',
                        assistantMsg.content
                    );
                    this.scrollToBottom();
                } else if (event.type === 'failed') {
                    this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                    this.handleError(event.response?.error_message || 'Response failed', null);
                }
            },
            error: (err: any) => {
                this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                this.handleError('Failed to send message', err);
                this.messages = this.messages.filter(m => m.id !== tempMsg.id);
            },
            complete: () => {
                this.loading = false;
            }
        });
    }

    onKeyPress(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
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

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer?.nativeElement) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        }, 0);
    }
}
