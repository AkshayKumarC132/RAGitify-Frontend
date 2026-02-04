import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest } from '../../../shared/models/response.model';
import { ResponseService } from '../../../shared/services/response.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-library-chat',
    templateUrl: './library-chat.component.html',
    styleUrls: ['./library-chat.component.scss']
})
export class LibraryChatComponent implements OnInit, AfterViewInit, OnDestroy {
    @Input() vectorStore: VectorStore | null = null;
    @Output() closed = new EventEmitter<void>();

    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

    messages: ConversationMessage[] = [];
    currentResponse: ResponseRecord | null = null;
    loading = false;
    messageInputText = '';
    errorMessage = '';
    private responsePollSub?: Subscription;

    constructor(
        private responseService: ResponseService
    ) { }

    ngOnInit(): void {
        // Initial greeting or empty state handled by template
    }

    ngAfterViewInit(): void {
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    close(): void {
        this.stopPolling();
        this.closed.emit();
    }

    sendMessage(): void {
        if (!this.messageInputText.trim() || this.loading || !this.vectorStore) {
            return;
        }

        const messageText = this.messageInputText.trim();
        this.messageInputText = '';
        this.loading = true;
        this.errorMessage = '';

        // Add user message to UI immediately
        const userMessage: ConversationMessage = {
            id: 'temp-' + Date.now(),
            role: 'user',
            content: messageText,
            created_at: new Date().toISOString()
        };
        this.messages.push(userMessage);
        this.scrollToBottom();

        this.sendResponse(messageText);
    }

    private sendResponse(messageText: string): void {
        if (!this.vectorStore) return;

        const request: ResponseCreateRequest = {
            model: this.responseService.getDefaultModel(),
            input: [
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: messageText }]
                }
            ],
            tools: [
                {
                    type: 'document',
                    vector_store_ids: [this.vectorStore.id]
                }
            ]
        };

        this.responseService.create(request).subscribe({
            next: (response) => {
                this.currentResponse = response;
                if (response.status === 'in_progress') {
                    this.startPolling(response.id);
                } else {
                    this.handleResponseComplete(response);
                }
            },
            error: (err) => {
                this.handleError('Failed to send message', err);
                // Remove the user message on error
                this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
            }
        });
    }

    private startPolling(responseId: string): void {
        this.stopPolling();
        this.responsePollSub = this.responseService.pollResponseStatus(responseId).subscribe({
            next: (response) => {
                if (response) {
                    this.currentResponse = response;
                    if (response.status === 'completed') {
                        this.handleResponseComplete(response);
                        this.stopPolling();
                    } else if (response.status === 'failed' || response.status === 'cancelled') {
                        this.handleError(response.error_message || 'Response failed');
                        this.stopPolling();
                    }
                }
            },
            error: (err) => {
                console.error('Error polling response:', err);
                this.stopPolling();
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
        this.currentResponse = null;

        if (response.output && response.output.length > 0) {
            const output = response.output[0];
            if (output.content && output.content.length > 0) {
                const assistantMessage: ConversationMessage = {
                    id: output.message_id || 'msg-' + Date.now(),
                    role: 'assistant',
                    content: output.content[0].text || '',
                    created_at: response.completed_at || response.created_at,
                    metadata: output.metadata || {}
                };
                this.messages.push(assistantMessage);
            }
        }
        this.scrollToBottom();
    }

    getDocumentIds(message: ConversationMessage): string[] {
        if (!message.metadata || !message.metadata['used_document_ids']) {
            return [];
        }
        return Array.isArray(message.metadata['used_document_ids'])
            ? message.metadata['used_document_ids']
            : [];
    }

    cancelResponse(): void {
        if (this.currentResponse && this.currentResponse.status === 'in_progress') {
            this.responseService.cancel(this.currentResponse.id).subscribe({
                next: () => {
                    this.currentResponse = null;
                    this.loading = false;
                    this.stopPolling();
                },
                error: (err) => {
                    console.error('Error cancelling response:', err);
                }
            });
        }
    }

    private handleError(message: string, error?: any): void {
        this.loading = false;
        this.errorMessage = message;
        if (error) {
            console.error(message, error);
        }
        setTimeout(() => {
            this.errorMessage = '';
        }, 5000);
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer?.nativeElement) {
                const container = this.messagesContainer.nativeElement;
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    onKeyPress(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    formatTime(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    get isResponseInProgress(): boolean {
        return this.loading || this.currentResponse?.status === 'in_progress';
    }
}
