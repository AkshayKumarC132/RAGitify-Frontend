import { Component, Input, OnChanges, SimpleChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-chat-container',
  templateUrl: './chat-container.component.html',
  styleUrls: ['./chat-container.component.scss']
})
export class ChatContainerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() messages: Message[] = [];
  @Input() currentRun: Run | null = null;

  @ViewChild('messagesWrapper') private messagesWrapper?: ElementRef<HTMLDivElement>;
  @ViewChild('messagesList') private messagesList?: ElementRef<HTMLDivElement>;

  private scrollTimer?: ReturnType<typeof setTimeout>;
  private isAutoScrolling = false;
  showJumpToBottom = false;
  private readonly scrollThreshold = 140;

  ngAfterViewInit(): void {
    this.queueScrollToBottom();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages']) {
      this.queueScrollToBottom();
    }
    if (changes['currentRun']) {
      const status = changes['currentRun'].currentValue?.status;
      if (status === 'in_progress' || status === 'queued') {
        this.queueScrollToBottom();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
  }

  private queueScrollToBottom(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.isAutoScrolling = true;
    this.scrollTimer = setTimeout(() => this.performScrollToBottom(), 0);
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

  trackByMessage(index: number, message: Message): number {
    return message.id;
  }
}