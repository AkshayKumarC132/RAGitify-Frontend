import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { Assistant } from '../../../shared/models/assistant.model';
import { Conversation, ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, TaskItem } from '../../../shared/models/response.model';
import { ResponseService } from '../../../shared/services/response.service';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-assistant-chat',
    templateUrl: './assistant-chat.component.html',
    styleUrls: ['./assistant-chat.component.scss']
})
export class AssistantChatComponent implements OnInit, AfterViewInit, OnDestroy {
    @Input() assistant: Assistant | null = null;
    @Output() closed = new EventEmitter<void>();

    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

    messages: ConversationMessage[] = [];
    conversation: Conversation | null = null;
    currentResponse: ResponseRecord | null = null;
    loading = false;
    messageInputText = '';
    errorMessage = '';
    isOverflowing = false;
    currentTasks: TaskItem[] = [];
    private streamSub?: Subscription;

    constructor(
        private responseService: ResponseService,
        private conversationService: ConversationService,
        private responseAttentionService: ResponseAttentionService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        // Initial greeting or empty state handled by template
    }

    ngAfterViewInit(): void {
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.stopStream();
    }

    close(): void {
        this.stopStream();
        this.closed.emit();
    }

    sendMessage(): void {
        if (!this.messageInputText.trim() || this.loading || !this.assistant) {
            return;
        }

        const messageText = this.messageInputText.trim();
        this.messageInputText = '';
        this.loading = true;
        this.errorMessage = '';

        // Reset textarea height after sending
        setTimeout(() => {
            if (this.messageInput?.nativeElement) {
                this.messageInput.nativeElement.style.height = 'auto';
            }
        });

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
            const title = this.assistant?.name ? `Assistant: ${this.assistant.name}` : 'Assistant Chat';
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
        if (!this.assistant || !this.conversation) return;

        const request: ResponseCreateRequest = {
            conversation: this.conversation.id,
            // Priority:
            // 1. Active Model (via getDefaultModel which reads from localStorage)
            // 2. Assistant's configured Model
            // 3. Fallback
            model: this.responseService.getDefaultModel() || this.assistant.model,
            input: [
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: messageText }]
                }
            ]
        };

        if (this.assistant.instructions) {
            request.instructions = this.assistant.instructions;
        }

        if (this.assistant.vector_store_id) {
            request.tools = [
                {
                    type: 'document',
                    vector_store_ids: [this.assistant.vector_store_id]
                }
            ];
        }

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
            next: (event) => {
                if (event.type === 'delta' && event.delta) {
                    assistantMessage.content += event.delta;
                    
                    // Hide task list once text starts streaming
                    if (this.currentTasks.length > 0) {
                        this.currentTasks = [];
                    }
                    
                    this.cdr.detectChanges();
                    this.scrollToBottom();
                } else if (event.type === 'task_update') {
                    this.currentTasks = (event.tasks || []).filter(t => t.status !== 'removed');
                    this.cdr.detectChanges();
                    this.scrollToBottom();
                } else if (event.type === 'completed') {
                    this.currentResponse = null;
                    this.loading = false;
                    this.currentTasks = [];
                    if (event.response) {
                        // Update the assistant message with final details if needed
                        const actualMessageId = event.response.output?.[0]?.message_id;
                        assistantMessage.id = actualMessageId || event.response.id;
                        assistantMessage.created_at = event.response.completed_at || event.response.created_at;

                        const outMeta = event.response.output?.[0]?.metadata;
                        if (outMeta) {
                            assistantMessage.metadata = { ...(assistantMessage.metadata || {}), ...outMeta };
                        }
                        if (event.response.has_data_grid !== undefined) {
                            assistantMessage.has_data_grid = event.response.has_data_grid;
                        }
                        if (event.response.data_grid_row_count !== undefined) {
                            (assistantMessage as any).data_grid_row_count = event.response.data_grid_row_count;
                        }

                        this.responseAttentionService.notifyResponseReady(
                            'Assistant test response ready',
                            assistantMessage.content
                        );
                    }
                    this.scrollToBottom();
                } else if (event.type === 'failed') {
                    this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
                    this.currentTasks = [];
                    this.handleError(event.response?.error_message || 'Response failed');
                }
            },
            error: (err) => {
                this.messages = this.messages.filter(m => m.id !== assistantMessage.id);
                this.currentTasks = [];
                this.handleError('Failed to send message', err);
                this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
            },
            complete: () => {
                this.loading = false;
                this.currentTasks = [];
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
        this.currentTasks = [];
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

    autoResizeInput(): void {
        if (this.messageInput?.nativeElement) {
            const textarea = this.messageInput.nativeElement;
            const maxHeight = 120;
            textarea.style.height = 'auto';
            const contentHeight = textarea.scrollHeight;
            textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
            this.isOverflowing = contentHeight > maxHeight;
        }
    }

    formatTime(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    get isResponseInProgress(): boolean {
        return this.loading || this.currentResponse?.status === 'in_progress';
    }

    get showTaskList(): boolean {
        if (!this.isResponseInProgress) {
            return false;
        }

        const lastMessage = this.messages[this.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            return true;
        }

        return !lastMessage.content;
    }
}
