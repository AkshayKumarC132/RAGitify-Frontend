import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Document } from '../../../shared/models/document.model';
import { Conversation, ConversationMessage } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, DocumentTool } from '../../../shared/models/response.model';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
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
  private responsePollSub?: Subscription;

  constructor(
    private conversationService: ConversationService,
    private responseService: ResponseService
  ) {}

  ngOnInit(): void {
    if (this.document) {
      this.loadConversation();
    }
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
      this.conversationService.create({ title }).subscribe({
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
      model: 'gpt-5.1', // Default model
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
          vector_store_ids: [this.document.vector_store]
        }
      ],
      metadata: {
        document_id: this.document.id,
        document_title: this.document.title
      }
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

    // Reload messages from conversation to get all messages
    this.loadConversationMessages();
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

  loadConversationMessages(): void {
    if (!this.conversation) return;

    this.conversationService.getMessages(this.conversation.id).subscribe({
      next: (messages) => {
        this.messages = messages;
        this.scrollToBottom();
      },
      error: (err) => {
        console.error('Error loading conversation messages:', err);
      }
    });
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
    return this.currentResponse?.status === 'in_progress';
  }
}

