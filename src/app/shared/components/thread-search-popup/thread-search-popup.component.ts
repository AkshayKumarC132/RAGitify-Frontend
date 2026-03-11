import { Component, Input, Output, EventEmitter, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Conversation, ConversationMessage } from '../../models/conversation.model';
import { ConversationService } from '../../services/conversation.service';

@Component({
  selector: 'app-thread-search-popup',
  templateUrl: './thread-search-popup.component.html',
  styleUrls: ['./thread-search-popup.component.scss']
})
export class ThreadSearchPopupComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() threads: Conversation[] = [];
  @Input() currentThread: Conversation | null = null;
  @Output() threadSelected = new EventEmitter<Conversation>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('dialogElement') dialogElement!: ElementRef<HTMLDivElement>;
  @ViewChild('resultsContainer') resultsContainer!: ElementRef<HTMLDivElement>;

  searchQuery = '';
  filteredThreads: Conversation[] = [];
  private searchDebounceTimeout: any;
  private messagesCache = new Map<string, ConversationMessage[]>();
  private matchSourceByThreadId = new Map<string, 'title' | 'message' | 'both'>();
  private messageSubscriptions: Subscription[] = [];
  private readonly maxConcurrentMessageFetches = 4;

  constructor(
    private sanitizer: DomSanitizer,
    private conversationService: ConversationService
  ) { }

  ngOnInit(): void {
    this.filteredThreads = [...this.threads];
    document.body.style.overflow = 'hidden';
  }

  ngAfterViewInit(): void {
    // Focus the search input on open
    setTimeout(() => {
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    this.messageSubscriptions.forEach(sub => sub.unsubscribe());
    document.body.style.overflow = '';
  }

  @HostListener('keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    event.preventDefault?.();
    this.close();
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    this.searchDebounceTimeout = setTimeout(() => {
      this.applyFilter();
    }, 200);
  }

  private applyFilter(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const currentQuery = query;

    if (!query) {
      this.filteredThreads = [...this.threads];
      this.matchSourceByThreadId.clear();
      return;
    }

    this.matchSourceByThreadId.clear();

    const titleMatches: Conversation[] = [];
    const remainingThreads: Conversation[] = [];

    for (const thread of this.threads) {
      const title = this.getThreadTitle(thread).toLowerCase();
      if (title.includes(query)) {
        titleMatches.push(thread);
        this.matchSourceByThreadId.set(thread.id, 'title');
      } else {
        remainingThreads.push(thread);
      }
    }

    const messageMatches: Conversation[] = [];
    const threadsNeedingFetch: Conversation[] = [];

    for (const thread of remainingThreads) {
      const cachedMessages = this.messagesCache.get(thread.id);
      if (cachedMessages) {
        const hasMatch = cachedMessages.some(msg =>
          (msg.content || '').toLowerCase().includes(query)
        );
        if (hasMatch) {
          messageMatches.push(thread);
          const existing = this.matchSourceByThreadId.get(thread.id);
          if (existing === 'title') {
            this.matchSourceByThreadId.set(thread.id, 'both');
          } else {
            this.matchSourceByThreadId.set(thread.id, 'message');
          }
        }
      } else {
        threadsNeedingFetch.push(thread);
      }
    }

    const nextFiltered = [...titleMatches, ...messageMatches];
    this.filteredThreads = nextFiltered;

    if (threadsNeedingFetch.length) {
      // Avoid firing N parallel API calls for large thread lists.
      // Limit concurrency to keep network + server load reasonable.
      const sub = from(threadsNeedingFetch).pipe(
        mergeMap(thread =>
          this.conversationService.getMessages(thread.id),
          this.maxConcurrentMessageFetches
        )
      ).subscribe({
        next: (messages) => {
          // The endpoint returns only messages, so infer the parent conversation id.
          const threadId = String((messages?.[0] as any)?.conversation_id || this.findThreadIdByMessages(messages));
          if (threadId) {
            this.messagesCache.set(threadId, messages);
          }

          if (this.searchQuery.trim().toLowerCase() !== currentQuery) {
            return;
          }

          if (!threadId) {
            return;
          }
          const thread = this.threads.find(t => t.id === threadId);
          if (!thread) {
            return;
          }

          const hasMatch = messages.some(msg =>
            (msg.content || '').toLowerCase().includes(currentQuery)
          );
          if (hasMatch && !this.filteredThreads.some(t => t.id === thread.id)) {
            this.filteredThreads = [...this.filteredThreads, thread];
            const existing = this.matchSourceByThreadId.get(thread.id);
            if (existing === 'title') {
              this.matchSourceByThreadId.set(thread.id, 'both');
            } else {
              this.matchSourceByThreadId.set(thread.id, 'message');
            }
          }
        },
        error: () => {
          // Ignore errors silently for search
        }
      });
      this.messageSubscriptions.push(sub);
    }
  }

  getThreadTitle(thread: Conversation): string {
    return thread.title || 'Untitled';
  }

  isTitleMatch(thread: Conversation): boolean {
    return this.matchSourceByThreadId.get(thread.id) === 'title' ||
      this.matchSourceByThreadId.get(thread.id) === 'both';
  }

  isMessageMatch(thread: Conversation): boolean {
    const matchSource = this.matchSourceByThreadId.get(thread.id);
    return matchSource === 'message' || matchSource === 'both';
  }

  highlightText(text: string, query: string): SafeHtml {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery || !text) {
      return this.sanitizer.sanitize(1, text) || '';
    }

    const escapedQuery = this.escapeRegExp(trimmedQuery);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const highlighted = text.replace(regex, '<mark class="thread-search-highlight">$1</mark>');
    return this.sanitizer.sanitize(1, highlighted) || '';
  }

  getHighlightedTitle(thread: Conversation): SafeHtml {
    const title = this.getThreadTitle(thread);
    return this.highlightText(title, this.searchQuery);
  }

  getHighlightedSnippet(thread: Conversation): SafeHtml {
    const snippet = this.getMessageSnippet(thread);
    return this.highlightText(snippet, this.searchQuery);
  }

  private getMessageSnippet(thread: Conversation): string {
    const messages = this.messagesCache.get(thread.id);
    if (!messages || !this.searchQuery.trim()) {
      return '';
    }
    const query = this.searchQuery.trim().toLowerCase();
    for (const message of messages) {
      const content = (message.content || '').trim();
      if (!content) {
        continue;
      }
      const lower = content.toLowerCase();
      const index = lower.indexOf(query);
      if (index !== -1) {
        const start = Math.max(0, index - 30);
        const end = Math.min(content.length, index + query.length + 30);
        const snippet = content.substring(start, end);
        return (start > 0 ? '…' : '') + snippet + (end < content.length ? '…' : '');
      }
    }
    return '';
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  selectThread(thread: Conversation): void {
    this.threadSelected.emit(thread);
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.close();
    }
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  trackByThreadId(index: number, thread: Conversation): string {
    return thread.id;
  }

  private findThreadIdByMessages(messages: ConversationMessage[]): string {
    const messageIds = new Set((messages || []).map(message => String(message.id)));
    for (const thread of this.threads) {
      const cached = this.messagesCache.get(thread.id);
      if (cached?.some(message => messageIds.has(String(message.id)))) {
        return thread.id;
      }
    }
    return '';
  }
}
