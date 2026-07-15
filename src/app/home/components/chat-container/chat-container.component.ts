import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { TaskItem } from '../../../shared/models/response.model';

type ChatMessage = {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

@Component({
  selector: 'app-chat-container',
  templateUrl: './chat-container.component.html',
  styleUrls: ['./chat-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatContainerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() messages: ChatMessage[] = [];
  @Input() currentRun: { status: string } | null = null;
  @Input() loading = false;
  @Input() typingStatuses: string[] = ['Retrieving', 'Searching', 'Thinking', 'Generating'];
  @Input() conversationId?: string;
  @Input() enableDataGrid: boolean = false;
  @Input() tasks: TaskItem[] = [];

  @ViewChild('messagesWrapper') private messagesWrapper?: ElementRef<HTMLDivElement>;

  private scrollTimer?: ReturnType<typeof setTimeout>;
  private isAutoScrolling = false;
  showJumpToBottom = false;
  private readonly scrollThreshold = 140;

  constructor(private cdr: ChangeDetectorRef) {}

  get isTyping(): boolean {
    return this.hasActiveRun;
  }

  get showTypingIndicator(): boolean {
    if (!this.hasActiveRun) {
      return false;
    }

    const lastMessage = this.messages[this.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return true;
    }

    return !lastMessage.content;
  }

  get hasActiveRun(): boolean {
    return this.loading || (!!this.currentRun && ['queued', 'in_progress', 'requires_action'].includes(this.currentRun.status));
  }

  get showTaskList(): boolean {
    if (!this.hasActiveRun) {
      return false;
    }

    const lastMessage = this.messages[this.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return true;
    }

    return !lastMessage.content;
  }

  ngAfterViewInit(): void {
    this.queueScrollToBottom();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages'] || changes['currentRun']) {
      this.queueScrollToBottom();
    }
    // When tasks arrive (rapid-fire from SSE stream), mark this OnPush component
    // dirty so Angular re-renders it and propagates the new tasks to app-task-list.
    // Also scroll to bottom so the task list is immediately visible without manual scroll.
    if (changes['tasks'] || changes['loading']) {
      this.cdr.markForCheck();
      if (changes['tasks'] && this.tasks?.length > 0) {
        this.queueScrollToBottom();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
  }

  onScroll(): void {
    if (this.isAutoScrolling) {
      return;
    }

    const container = this.messagesWrapper?.nativeElement;
    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    this.showJumpToBottom = distanceFromBottom > this.scrollThreshold;
  }

  jumpToBottom(): void {
    this.isAutoScrolling = true;
    this.performScrollToBottom();
  }

  trackByMessage(index: number, message: ChatMessage): string | number {
    return message.id || index;
  }

  private queueScrollToBottom(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.isAutoScrolling = true;
    this.scrollTimer = setTimeout(() => this.performScrollToBottom(), 0);
  }

  private performScrollToBottom(): void {
    if (!this.messagesWrapper?.nativeElement) {
      this.isAutoScrolling = false;
      return;
    }

    const container = this.messagesWrapper.nativeElement;
    container.scrollTop = container.scrollHeight;
    this.showJumpToBottom = false;
    this.isAutoScrolling = false;
  }
}
