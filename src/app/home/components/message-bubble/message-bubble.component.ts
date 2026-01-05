import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-message-bubble',
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss']
})
export class MessageBubbleComponent implements OnInit, OnDestroy {
  @Input() message!: Message;
  @Input() isLast: boolean = false;
  @Input() canRerun: boolean = false;
  @Input() run: Run | undefined;
  @Input() rerunLoading: boolean = false;
  @Input() showPager: boolean = false;
  @Input() pageLabel: string = '';
  @Input() pagerHasPrev: boolean = false;
  @Input() pagerHasNext: boolean = false;
  @Output() rerun = new EventEmitter<void>();
  @Output() pagerPrev = new EventEmitter<void>();
  @Output() pagerNext = new EventEmitter<void>();

  displayContent: string = '';
  private typingSpeed = 5; // ms per character
  // Track messages that have already played the typing animation in this session
  private static animatedMessageIds = new Set<number>();
  copied = false;
  private copyResetTimeout?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    const safeContent = this.sanitizeContent(this.message.content);
    if (this.shouldAnimate()) {
      MessageBubbleComponent.animatedMessageIds.add(this.message.id);
      this.typeWriter(safeContent);
    } else {
      this.displayContent = safeContent;
      // Mark as animated so it won't animate in future navigations
      MessageBubbleComponent.animatedMessageIds.add(this.message.id);
    }
  }

  private sanitizeContent(content: string): string {
    if (!content) {
      return content;
    }

    const lower = content.toLowerCase();
    const patterns = [
      'run processing failed',
      'failed to answer question',
      'failed to initialize qdrant',
      'qdrant',
      'target machine actively refused'
    ];

    const hasServerFailure = patterns.some(p => lower.includes(p));
    return hasServerFailure ? 'Oops! Server error.' : content;
  }

  ngOnDestroy(): void {
    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
    }
  }

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  get isCancelledRun(): boolean {
    const hasEmptyContent = !this.message.content || 
                           (typeof this.message.content === 'string' && this.message.content.trim() === '');
    return !this.isUser && 
           this.run?.status === 'cancelled' && 
           hasEmptyContent;
  }

  get showEmptyState(): boolean {
    return this.isCancelledRun;
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private shouldAnimate(): boolean {
    const alreadyAnimated = MessageBubbleComponent.animatedMessageIds.has(this.message.id);

    return !this.isUser &&
      this.isLast &&
      this.isRecent() &&
      !alreadyAnimated;
  }

  private isRecent(): boolean {
    const messageTime = new Date(this.message.created_at).getTime();
    const now = new Date().getTime();
    return (now - messageTime) < 60000; // Less than 1 minute old
  }

  private typeWriter(text: string, index: number = 0) {
    if (index < text.length) {
      this.displayContent += text.charAt(index);
      setTimeout(() => {
        this.typeWriter(text, index + 1);
      }, this.typingSpeed);
    }
  }

  async copyMessage(): Promise<void> {
    const textToCopy = this.displayContent || this.message.content || '';

    if (!textToCopy) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        this.fallbackCopy(textToCopy);
      }
      this.showCopiedFeedback();
    } catch (error) {
      console.error('Failed to copy message', error);
      this.fallbackCopy(textToCopy);
      this.showCopiedFeedback();
    }
  }

  private fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private showCopiedFeedback(): void {
    this.copied = true;
    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
    }
    this.copyResetTimeout = setTimeout(() => {
      this.copied = false;
    }, 2000);
  }

  onRerunClick(): void {
    if (this.rerunLoading) {
      return;
    }
    this.rerun.emit();
  }

  onPagerPrev(): void {
    if (this.pagerHasPrev) {
      this.pagerPrev.emit();
    }
  }

  onPagerNext(): void {
    if (this.pagerHasNext) {
      this.pagerNext.emit();
    }
  }
}
