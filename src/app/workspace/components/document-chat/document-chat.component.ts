import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { Document } from '../../../shared/models/document.model';
import { Conversation, ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, DocumentTool } from '../../../shared/models/response.model';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-document-chat',
  templateUrl: './document-chat.component.html',
  styleUrls: ['./document-chat.component.scss']
})
export class DocumentChatComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() document: Document | null = null;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

  conversation: Conversation | null = null;
  messages: ConversationMessage[] = [];
  currentResponse: ResponseRecord | null = null;
  loading = false;
  messageInputText = '';
  errorMessage = '';
  isExpanded = false;
  private streamSub?: Subscription;
  private ephemeralMetadataMap = new Map<string, any>();
  private scrollPending = false;

  constructor(
    private conversationService: ConversationService,
    private responseService: ResponseService,
    private responseAttentionService: ResponseAttentionService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.document) {
      this.loadConversation();
    }
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

  loadConversation(): void {
    if (!this.document) return;

    // For now, we'll create a conversation on first message
    // In the future, we could store conversation_id in document metadata
    this.messages = [];
    this.conversation = null;
    this.errorMessage = '';
  }

  sendMessage(): void {
    if (!this.messageInputText.trim() || this.loading || !this.document) {
      return;
    }

    const messageText = this.messageInputText.trim();
    this.messageInputText = '';
    this.isExpanded = false;
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

    // Create conversation if it doesn't exist
    if (!this.conversation) {
      this.createConversation().then(() => {
        this.sendResponse(messageText);
      }).catch(err => {
        this.handleError('Failed to create conversation', err);
      });
    } else {
      this.sendResponse(messageText);
    }
  }

  private createConversation(): Promise<void> {
    return new Promise((resolve, reject) => {
      const title = this.document?.title ? `Chat: ${this.document.title}` : undefined;
      this.conversationService.create({ title, is_temporary: true, enable_data_grid: true }).subscribe({
        next: (conversation) => {
          this.conversation = conversation;
          resolve();
        },
        error: (err) => {
          reject(err);
        }
      });
    });
  }

  private sendResponse(messageText: string): void {
    if (!this.document || !this.conversation) {
      this.handleError('Document or conversation not available');
      return;
    }

    const request: ResponseCreateRequest = {
      conversation: this.conversation.id,
      model: this.responseService.getDefaultModel(),
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: messageText }],
          metadata: {}
        }
      ],
      tools: [
        {
          type: 'document',
          vector_store_ids: [this.document.vector_store],
          document_ids: [this.document.id]
        }
      ],
      metadata: {
        document_id: this.document.id,
        document_title: this.document.title
      }
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
      next: (event) => {
        if (event.type === 'delta' && event.delta) {
          assistantMessage.content += event.delta;
          this.cdr.detectChanges();
          this.scrollToBottom();
        } else if (event.type === 'completed') {
          this.currentResponse = null;
          this.loading = false;

          const outMetadata = event.response?.output?.[0]?.metadata;
          if (outMetadata && this.conversation) {
            this.ephemeralMetadataMap.set(String(this.conversation.id), outMetadata);
            assistantMessage.metadata = { ...(assistantMessage.metadata || {}), ...outMetadata };
          }
          if (event.response?.has_data_grid !== undefined) {
            assistantMessage.has_data_grid = event.response.has_data_grid;
          }
          if (event.response?.data_grid_row_count !== undefined) {
            (assistantMessage as any).data_grid_row_count = event.response.data_grid_row_count;
          }

          if (event.response) {
            this.responseAttentionService.notifyResponseReady(
              'Document chat response ready',
              assistantMessage.content
            );
          }
          this.loadConversationMessages();
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

  loadConversationMessages(): void {
    if (!this.conversation) return;

    this.conversationService.getMessages(this.conversation.id).subscribe({
      next: (messages) => {
        const ephemeral = this.ephemeralMetadataMap.get(String(this.conversation!.id));
        if (ephemeral && messages && messages.length > 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
              messages[i].metadata = { ...(messages[i].metadata || {}), ...ephemeral };
              break;
            }
          }
        }
        this.messages = messages;
        this.scrollToBottom();
      },
      error: (err) => {
        console.error('Error loading conversation messages:', err);
      }
    });
  }

  cancelResponse(): void {
    this.stopStream();
    this.currentResponse = null;
    this.loading = false;
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
    if (this.scrollPending) {
      return; // already queued — skip
    }
    this.scrollPending = true;
    requestAnimationFrame(() => {
      this.scrollPending = false;
      if (this.messagesContainer?.nativeElement) {
        const container = this.messagesContainer.nativeElement;
        container.scrollTop = container.scrollHeight;
      }
    });
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
      // Reset height to auto to get the correct scrollHeight based on the new content
      textarea.style.height = 'auto';
      // Set the height matching the scrollHeight. Max height is restricted by SCSS.
      textarea.style.height = `${textarea.scrollHeight}px`;

      if (textarea.scrollHeight > 52) {
        this.isExpanded = true;
      } else if (!this.messageInputText) {
        this.isExpanded = false;
      }
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
    return this.loading || this.currentResponse?.status === 'in_progress';
  }
}
