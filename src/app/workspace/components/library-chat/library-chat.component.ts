import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Conversation, ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, StreamEvent } from '../../../shared/models/response.model';
import { ResponseService } from '../../../shared/services/response.service';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
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
    conversation: Conversation | null = null;
    currentResponse: ResponseRecord | null = null;
    loading = false;
    messageInputText = '';
    errorMessage = '';
    private streamSub?: Subscription;

    constructor(
        private responseService: ResponseService,
        private conversationService: ConversationService,
        private responseAttentionService: ResponseAttentionService
    ) { }

    ngOnInit(): void {
        // Initial greeting or empty state handled by template
    }

    ngAfterViewInit(): void {
        this.scrollToBottom();
        setTimeout(() => this.messageInput?.nativeElement.focus(), 0);
    }

    ngOnDestroy(): void {
        this.stopStream();
    }

    close(): void {
        this.stopStream();
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

        if (!this.conversation) {
            this.createConversation().then(() => {
                this.sendResponse(messageText);
            }).catch(err => {
                this.handleError('Failed to create conversation', err);
                this.messages = this.messages.filter(m => m.id !== userMessage.id);
            });
        } else {
            this.sendResponse(messageText);
        }
    }

    private createConversation(): Promise<void> {
        return new Promise((resolve, reject) => {
            const title = this.vectorStore?.name ? `Library: ${this.vectorStore.name}` : 'Library Chat';
            this.conversationService.create({ title, is_temporary: true }).subscribe({
                next: (conv) => {
                    this.conversation = conv;
                    resolve();
                },
                error: (err) => reject(err)
            });
        });
    }

    private sendResponse(messageText: string): void {
        if (!this.vectorStore || !this.conversation) return;

        const request: ResponseCreateRequest = {
            conversation: this.conversation.id,
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

        // Add a placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: 'streaming-' + Date.now(),
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString()
        };
        this.messages.push(assistantMessage);
        this.scrollToBottom();

        this.stopStream();
        this.streamSub = this.responseService.createStream(request).subscribe({
            next: (event: StreamEvent) => {
                if (event.type === 'delta' && event.delta) {
                    assistantMessage.content += event.delta;
                    this.scrollToBottom();
                } else if (event.type === 'completed') {
                    this.currentResponse = null;
                    this.loading = false;
                    if (event.response) {
                        this.responseAttentionService.notifyResponseReady(
                            'Library chat response ready',
                            assistantMessage.content
                        );
                        // Update the assistant message with final details if needed
                        assistantMessage.id = event.response.id;
                        assistantMessage.created_at = event.response.completed_at || event.response.created_at;
                        assistantMessage.metadata = event.response.output?.[0]?.metadata || {};
                    }
                    this.scrollToBottom();
                } else if (event.type === 'failed') {
                    this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
                    this.handleError(event.response?.error_message || 'Response failed');
                }
            },
            error: (err) => {
                this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
                this.handleError('Failed to send message', err);
                this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
            },
            complete: () => {
                this.loading = false;
            }
        });
    }

    private stopStream(): void {
        if (this.streamSub) {
            this.streamSub.unsubscribe();
            this.streamSub = undefined;
        }
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
        this.stopStream();
        this.currentResponse = null;
        this.loading = false;
        // Remove any streaming assistant message that might be in progress
        this.messages = this.messages.filter(m => !m.id.startsWith('streaming-'));
        // Also remove the last user message if it was just sent and no response was received
        this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
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

    get showTypingIndicator(): boolean {
        if (!this.isResponseInProgress) {
            return false;
        }

        const lastMessage = this.messages[this.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            return true;
        }

        return !lastMessage.content;
    }

    get isResponseInProgress(): boolean {
        return this.loading || !!(this.streamSub && !this.streamSub.closed);
    }
}
