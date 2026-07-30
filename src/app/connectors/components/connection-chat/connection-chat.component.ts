import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';
import { Conversation, ConversationMessage, AttachedDataGrid } from '../../../shared/models/conversation.model';
import { ResponseRecord, ResponseCreateRequest, StreamEvent, TaskItem, DataGridTool } from '../../../shared/models/response.model';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ResponseService } from '../../../shared/services/response.service';
import { ResponseAttentionService } from '../../../shared/services/response-attention.service';
import { DatagridAttachmentService } from '../../../shared/services/datagrid-attachment.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-connection-chat',
  templateUrl: './connection-chat.component.html',
  styleUrls: ['./connection-chat.component.scss']
})
export class ConnectionChatComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() connection: DatabaseConnection | null = null;
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
  isOverflowing = false;
  currentTasks: TaskItem[] = [];
  attachedDataGrid: AttachedDataGrid | null = null;
  private streamSub?: Subscription;
  private datagridSub?: Subscription;
  private ephemeralMetadataMap = new Map<string, any>();
  private scrollPending = false;

  constructor(
    private conversationService: ConversationService,
    private responseService: ResponseService,
    private responseAttentionService: ResponseAttentionService,
    private datagridAttachmentService: DatagridAttachmentService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.connection) {
      this.loadConversation();
    }
    this.datagridSub = this.datagridAttachmentService.attachedDataGrid$.subscribe(grid => {
      this.attachedDataGrid = grid;
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.stopStream();
    this.datagridSub?.unsubscribe();
    this.datagridAttachmentService.clearAttachment();
  }

  close(): void {
    this.stopStream();
    this.datagridAttachmentService.clearAttachment();
    this.closed.emit();
  }

  removeAttachedDataGrid(event: Event): void {
    event.stopPropagation();
    this.datagridAttachmentService.clearAttachment();
  }

  getDatabaseIcon(): string {
    if (!this.connection) return 'assets/postgres.svg';

    const typeName = (
      this.connection.connection_type?.driver_name ||
      this.connection.connection_type?.name ||
      this.connection.metadata?.['connection_type'] ||
      this.connection.metadata?.['type'] ||
      (this.connection.port === 8123 || this.connection.port === 9000 ? 'clickhouse' : '')
    ).toString().toLowerCase();

    if (typeName.includes('postgres')) return 'assets/postgres.svg';
    if (typeName.includes('clickhouse')) return 'assets/clickhouse.svg';
    if (typeName.includes('mysql')) return 'assets/mysql.svg';
    if (typeName.includes('mongodb')) return 'assets/mongodb.svg';
    if (typeName.includes('redis')) return 'assets/redis.svg';
    if (typeName.includes('snowflake')) return 'assets/snowflake.svg';
    if (typeName.includes('bigquery')) return 'assets/bigquery.svg';

    return 'assets/postgres.svg';
  }

  loadConversation(): void {
    this.messages = [];
    this.conversation = null;
    this.errorMessage = '';
    this.datagridAttachmentService.clearAttachment();
  }

  sendMessage(): void {
    if (!this.messageInputText.trim() || this.loading || !this.connection) {
      return;
    }

    const messageText = this.messageInputText.trim();
    this.messageInputText = '';
    this.isExpanded = false;
    this.loading = true;
    this.errorMessage = '';

    setTimeout(() => {
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.style.height = 'auto';
      }
    });

    const attachedGrid = this.datagridAttachmentService.getCurrentAttachment();

    const userMessage: ConversationMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
      metadata: attachedGrid ? { attached_datagrid: attachedGrid } : undefined
    };
    this.messages.push(userMessage);
    this.scrollToBottom();

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
      const title = this.connection?.name
        ? `Chat: ${this.connection.name}`
        : (this.connection?.database_name ? `Chat: ${this.connection.database_name}` : 'Connection Chat');
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
    if (!this.connection || !this.conversation) {
      this.handleError('Connection or conversation not available');
      return;
    }

    const attachedGrid = this.datagridAttachmentService.getCurrentAttachment();

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
      db_connection_ids: [this.connection.id!],
      // DataGrid tool: the backend validates ownership, injects query_datagrid,
      // and appends column/schema context instructions server-side.
      tools: attachedGrid
        ? [{ type: 'datagrid', datagrid_id: attachedGrid.id } as DataGridTool]
        : undefined,
      metadata: {
        db_connection_id: this.connection.id,
        connection_name: this.connection.name || this.connection.database_name,
        ...(attachedGrid ? { attached_datagrid: attachedGrid } : {})
      }
    };

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
          const lastIdx = this.messages.length - 1;
          this.messages = [...this.messages.slice(0, lastIdx), { ...assistantMessage }];

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
              'Connection chat response ready',
              assistantMessage.content
            );
          }
          this.loadConversationMessages();
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
      return;
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
      const maxHeight = 120;
      textarea.style.height = 'auto';
      const contentHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
      this.isOverflowing = contentHeight > maxHeight;

      if (contentHeight > 52) {
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
