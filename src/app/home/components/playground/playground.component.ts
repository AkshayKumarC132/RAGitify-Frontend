import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, HostListener } from '@angular/core';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest } from '../../../shared/models/response.model';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
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

    // Library selection
    libraries: VectorStore[] = [];
    attachmentMenuOpen = false;
    libraryPanelOpen = false;
    /**
     * Multi-vector-store selection (libraries) for temporary chat.
     * This enables sending multiple vector_store_ids in a single request.
     */
    selectedVectorStoreIds: string[] = [];
    pendingVectorStoreIds = new Set<string>();
    librariesLoaded = false;
    private librariesLoading = false;
    showVectorStoreHoverDetails = false;

    private allDefaultQuestions = [
        "How can I improve my productivity?",
        "What are some effective time management techniques?",
        "Can you recommend some good books to read?",
        "Tell me a fun fact about technology.",
        "How can I stay motivated?",
        "What are popular travel destinations?",
        "Tell me an interesting historical fact.",
        "How can I learn a new language?",
        "What are the latest trends in technology?",
        "Can you suggest some fun hobbies?"
    ];

    defaultQuestions: string[] = [];

    documentQuestions = [
        "Summarize these libraries",
        "What are the main insights?",
        "Analyze themes across documents",
        "Key takeaways from attachments"
    ];

    get suggestedQuestions(): string[] {
        if (this.mode === 'document') {
            return this.documentQuestions;
        }
        return this.defaultQuestions;
    }

    onQuestionClick(question: string): void {
        this.inputMessage = question;
    }

    constructor(
        private conversationService: ConversationService,
        private responseService: ResponseService,
        private vectorStoreService: VectorStoreService
    ) { }

    ngOnInit(): void {
        this.shuffleDefaultQuestions();
        this.createTemporaryConversation();
    }

    private shuffleDefaultQuestions(): void {
        const shuffled = [...this.allDefaultQuestions].sort(() => 0.5 - Math.random());
        this.defaultQuestions = shuffled.slice(0, 5);
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


    toggleAttachmentMenu(): void {
        this.attachmentMenuOpen = !this.attachmentMenuOpen;
        if (this.attachmentMenuOpen) {
            this.loadLibraries();
            this.libraryPanelOpen = false;
        }
    }

    openLibraryPanel(): void {
        this.attachmentMenuOpen = false;
        this.libraryPanelOpen = true;
        this.pendingVectorStoreIds = new Set(this.selectedVectorStoreIds || []);
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


    isLibrarySelected(libraryId: string): boolean {
        return this.pendingVectorStoreIds.has(String(libraryId));
    }

    toggleLibrarySelectionClick(libraryId: string, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const id = String(libraryId);
        const isSelected = this.pendingVectorStoreIds.has(id);
        const next = new Set(this.pendingVectorStoreIds);

        if (isSelected) {
            next.delete(id);
        } else {
            next.add(id);
        }

        this.pendingVectorStoreIds = next;

        // Keep the visual checkbox state in sync immediately
        const label = event.currentTarget as HTMLElement;
        const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (checkbox) {
            checkbox.checked = !isSelected;
        }
    }

    confirmSelection(): void {
        this.selectedVectorStoreIds = Array.from(this.pendingVectorStoreIds);

        if (this.selectedVectorStoreIds.length > 0) {
            this.mode = 'document';
        }
        this.libraryPanelOpen = false;
    }

    clearSelection(): void {
        this.selectedVectorStoreIds = [];
        this.pendingVectorStoreIds.clear();
        this.mode = 'normal';
        this.libraryPanelOpen = false;
    }

    get selectionCount(): number {
        return this.selectedVectorStoreIds.length;
    }

    get selectionLabel(): string {
        if (this.selectedVectorStoreIds.length === 0) {
            return '';
        }
        return `${this.selectedVectorStoreIds.length} librar${this.selectedVectorStoreIds.length === 1 ? 'y' : 'ies'} selected`;
    }

    get selectedVectorStores(): VectorStore[] {
        const ids = new Set((this.selectedVectorStoreIds || []).map(String));
        return (this.libraries || []).filter(l => ids.has(String(l.id)));
    }

    removeSelectedVectorStore(id: string, event?: MouseEvent): void {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const next = new Set((this.selectedVectorStoreIds || []).map(String));
        next.delete(String(id));
        this.selectedVectorStoreIds = Array.from(next);
        if (!this.selectedVectorStoreIds.length) {
            this.mode = 'normal';
        }
    }

    onSelectionPillEnter(): void {
        this.showVectorStoreHoverDetails = true;
    }

    onSelectionPillLeave(): void {
        this.showVectorStoreHoverDetails = false;
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
        this.conversationId = null;
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
            input: [{
                role: 'user',
                content: [{ type: 'input_text', text: content }]
            }]
        };

        // Add tools if libraries selected
        if (this.mode === 'document' && this.selectedVectorStoreIds.length > 0) {
            const uniqueIds = Array.from(new Set(this.selectedVectorStoreIds.filter(Boolean).map(String)));
            if (uniqueIds.length > 0) {
                request.tools = [{
                    type: 'document',
                    vector_store_ids: uniqueIds
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
