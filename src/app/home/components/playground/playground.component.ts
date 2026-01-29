import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, HostListener } from '@angular/core';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest } from '../../../shared/models/response.model';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-playground',
    templateUrl: './playground.component.html',
    styleUrls: ['./playground.component.scss']
})
export class PlaygroundComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @Output() closed = new EventEmitter<void>();

    messages: ConversationMessage[] = [];
    conversationId: string | null = null;
    loading = false;
    inputMessage = '';
    errorMessage = '';
    mode: 'normal' | 'document' = 'normal';
    private responsePollSub?: Subscription;

    // Library/Document selection
    libraries: VectorStore[] = [];
    documents: Document[] = [];
    attachmentMenuOpen = false;
    libraryPanelOpen = false;
    selectedLibraryId: string | null = null;
    selectedDocumentIds: string[] = [];
    pendingLibraryId: string | null = null;
    pendingDocumentIds = new Set<string>();
    selectionMode: 'library' | 'documents' = 'library';
    librariesLoaded = false;
    private librariesLoading = false;
    private documentsLoaded = false;
    private documentsLoading = false;

    constructor(
        private conversationService: ConversationService,
        private responseService: ResponseService,
        private vectorStoreService: VectorStoreService,
        private documentService: DocumentService
    ) { }

    ngOnInit(): void {
        this.createTemporaryConversation();
    }

    ngOnDestroy(): void {
        this.cleanupConversation();
    }

    ngAfterViewInit(): void {
        this.scrollToBottom();
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
        this.documentService.list().subscribe({
            next: (docs) => {
                this.documents = docs.filter(d => d.status !== 'failed');
                this.documentsLoaded = true;
                this.documentsLoading = false;
            },
            error: (err) => {
                console.error('Failed to load documents', err);
                this.documentsLoaded = false;
                this.documentsLoading = false;
            }
        });
    }

    toggleAttachmentMenu(): void {
        this.attachmentMenuOpen = !this.attachmentMenuOpen;
        if (this.attachmentMenuOpen) {
            this.libraryPanelOpen = false;
        }
    }

    openLibraryPanel(): void {
        this.loadLibraries();
        this.loadDocuments();
        this.attachmentMenuOpen = false;
        this.libraryPanelOpen = true;
        this.pendingLibraryId = this.selectedLibraryId;
        this.pendingDocumentIds = new Set(this.selectedDocumentIds);
    }

    closePanel(): void {
        this.libraryPanelOpen = false;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.attachment-controls') && !target.closest('.attachment-panel') && !target.closest('.attachment-menu')) {
            this.attachmentMenuOpen = false;
            this.libraryPanelOpen = false;
        }
    }

    setSelectionMode(mode: 'library' | 'documents'): void {
        this.selectionMode = mode;
    }

    getDocumentsByLibrary(): { libraryId: string; name: string; documents: Document[] }[] {
        const grouping = new Map<string, Document[]>();
        this.documents.forEach(doc => {
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

    isDocumentSelected(docId: string): boolean {
        return this.pendingDocumentIds.has(String(docId));
    }

    toggleDocumentSelection(docId: string, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const id = String(docId);
        if (this.pendingDocumentIds.has(id)) {
            this.pendingDocumentIds.delete(id);
        } else {
            this.pendingDocumentIds.add(id);
        }
    }

    confirmSelection(): void {
        if (this.selectionMode === 'documents') {
            this.selectedDocumentIds = Array.from(this.pendingDocumentIds);
            this.selectedLibraryId = null;
        } else {
            this.selectedLibraryId = this.pendingLibraryId;
            this.selectedDocumentIds = [];
        }

        if (this.selectedLibraryId || this.selectedDocumentIds.length > 0) {
            this.mode = 'document';
        }
        this.libraryPanelOpen = false;
    }

    clearSelection(): void {
        this.selectedLibraryId = null;
        this.selectedDocumentIds = [];
        this.pendingLibraryId = null;
        this.pendingDocumentIds.clear();
        this.mode = 'normal';
        this.libraryPanelOpen = false;
    }

    get selectionCount(): number {
        if (this.selectedLibraryId) return 1;
        return this.selectedDocumentIds.length;
    }

    get selectionLabel(): string {
        if (this.selectedLibraryId) {
            const lib = this.libraries.find(l => l.id === this.selectedLibraryId);
            return lib ? lib.name : '1 library selected';
        }
        if (this.selectedDocumentIds.length > 0) {
            return `${this.selectedDocumentIds.length} document${this.selectedDocumentIds.length === 1 ? '' : 's'} selected`;
        }
        return '';
    }

    private createTemporaryConversation(): void {
        this.conversationService.create({ title: 'Play Ground' }).subscribe({
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
        if (this.conversationId) {
            this.conversationService.delete(this.conversationId).subscribe({
                error: (err: any) => console.error('Error cleaning up playground', err)
            });
            this.conversationId = null;
        }
        this.stopPolling();
    }

    sendMessage(): void {
        if (!this.inputMessage.trim() || this.loading || !this.conversationId) return;

        const content = this.inputMessage.trim();
        this.inputMessage = '';
        this.loading = true;

        const tempMsg: ConversationMessage = {
            id: 'temp-' + Date.now(),
            role: 'user',
            content: content,
            created_at: new Date().toISOString()
        };
        this.messages.push(tempMsg);
        this.scrollToBottom();

        const request: ResponseCreateRequest = {
            conversation: this.conversationId,
            model: this.responseService.getDefaultModel(),
            instructions: "You are an intelligent and professional assistant designed to help users retrieve campaign details and associated information efficiently and accurately. Always understand user intent even when vague, indirect, or conversational. Always search the vector store first before taking any action. If the user query includes an email address, respond only if an exact email match exists in the vector store. If a campaign name or partial campaign data is provided, use semantic matching and never hallucinate details. If relevant campaign data exists, immediately respond with all available information including campaign name, status, type, owner, associated email or contacts, company details, recent interactions, performance metrics, leads, deals, engagement data, timelines, and any other available attributes. **Important**: Exclude and don't display 'Event Start Date' and 'Event End Date' fields if it is an Email, Video, Page or Survey campaign; only display if it is an Event campaign. Clearly mention if any data is incomplete. If multiple campaigns match the query, do not guess and ask the user: “I found multiple campaigns. Could you confirm which one you're referring to?” and after clarification always re-check the vector store and present the full campaign details. Always provide complete and factual campaign data from the database. Never say “I couldn't find any specific information about X in the uploaded files”; instead say “I couldn't find any specific information about X in the database.” Maintain a professional, guided, and interactive tone and end with a helpful prompt related only to the current campaign details.Important always Represent all dates and times in MMMM d, yyyy HH:mm format.",
            input: [{
                role: 'user',
                content: [{ type: 'input_text', text: content }]
            }]
        };

        // Add tools if library or documents selected
        if (this.mode === 'document') {
            const vectorStoreIds: string[] = [];
            if (this.selectedLibraryId) {
                vectorStoreIds.push(this.selectedLibraryId);
            }
            if (this.selectedDocumentIds.length > 0) {
                // Get unique vector store IDs from selected documents
                const docVectorStores = this.documents
                    .filter(d => this.selectedDocumentIds.includes(String(d.id)))
                    .map(d => d.vector_store);
                vectorStoreIds.push(...new Set(docVectorStores));
            }
            if (vectorStoreIds.length > 0) {
                request.tools = [{
                    type: 'document',
                    vector_store_ids: vectorStoreIds
                }];
            }
        }

        this.responseService.create(request).subscribe({
            next: (response) => {
                if (response.status === 'in_progress') {
                    this.startPolling(response.id);
                } else {
                    this.handleResponseComplete(response);
                }
            },
            error: (err: any) => {
                this.handleError('Failed to send message', err);
                this.messages = this.messages.filter(m => m.id !== tempMsg.id);
            }
        });
    }

    private startPolling(responseId: string): void {
        this.stopPolling();
        this.responsePollSub = this.responseService.pollResponseStatus(responseId).subscribe({
            next: (response) => {
                if (response) {
                    if (response.status === 'completed') {
                        this.handleResponseComplete(response);
                        this.stopPolling();
                    } else if (response.status === 'failed' || response.status === 'cancelled') {
                        this.handleError(response.error_message || 'Response failed', null);
                        this.stopPolling();
                    }
                }
            },
            error: (err: any) => {
                this.stopPolling();
                console.error(err);
            }
        });
    }

    private stopPolling(): void {
        if (this.responsePollSub) {
            this.responsePollSub.unsubscribe();
            this.responsePollSub = undefined;
        }
    }

    private handleResponseComplete(response: ResponseRecord): void {
        this.loading = false;
        if (response.output && response.output.length > 0) {
            const output = response.output[0];
            if (output.content && output.content.length > 0) {
                const assistantMsg: ConversationMessage = {
                    id: output.message_id || 'msg-' + Date.now(),
                    role: 'assistant',
                    content: output.content[0].text,
                    created_at: response.completed_at || new Date().toISOString()
                };
                this.messages.push(assistantMsg);
                this.scrollToBottom();
            }
        }
    }

    private handleError(msg: string, err: any): void {
        this.loading = false;
        this.errorMessage = msg;
        console.error(msg, err);
        setTimeout(() => this.errorMessage = '', 5000);
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer?.nativeElement) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        }, 0);
    }

    onKeyPress(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }
}
