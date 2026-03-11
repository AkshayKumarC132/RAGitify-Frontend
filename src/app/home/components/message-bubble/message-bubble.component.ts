import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-message-bubble',
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss']
})
export class MessageBubbleComponent implements OnInit, OnDestroy, OnChanges {
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
  renderedContent: SafeHtml | null = null;
  copied = false;
  private copyResetTimeout?: ReturnType<typeof setTimeout>;

  constructor(private sanitizer: DomSanitizer) { }

  get isFailedRun(): boolean {
    return !this.isUser && this.run?.status === 'failed';
  }

  get runErrorMessage(): string {
    const msg = this.run?.metadata?.['error_message'];
    return typeof msg === 'string' ? msg : '';
  }

  get showRunErrorInfo(): boolean {
    return this.isFailedRun && !!this.runErrorMessage;
  }

  ngOnInit() {
    const safeContent = this.sanitizeContent(this.message.content);
    this.displayContent = safeContent;
    this.updateRenderedContent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When run status updates (e.g. in_progress -> failed), recompute displayed content
    // so we show "Oops! Server error." in the bubble.
    if (changes['run'] || changes['message']) {
      const safeContent = this.sanitizeContent(this.message?.content);
      this.displayContent = safeContent;
      this.updateRenderedContent();
    }
  }

  private sanitizeContent(content?: string): string {
    if (!content) {
      return content || '';
    }

    // Prefer run status over brittle text matching.
    // If the backend marks the run as failed, show a consistent error response.
    if (this.message?.role === 'assistant' && this.run?.status === 'failed') {
      return 'Oops!';
    }

    return content;
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

  private updateRenderedContent(): void {
    if (this.isUser) {
      this.renderedContent = null;
      return;
    }

    const raw = this.displayContent || '';
    const html = marked.parse(raw) as string;
    const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
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
