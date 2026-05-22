import { Component, Input, Output, EventEmitter, HostListener, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, Subscription, from, of } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';
import { Conversation, ConversationMessage } from '../../../shared/models/conversation.model';
import { User } from '../../../shared/models/user.model';
import { ThemeService } from '../../../shared/services/theme.service';
import { ConversationService } from '../../../shared/services/conversation.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ThreadSearchPopupService } from '../../../shared/services/thread-search-popup.service';
import { ChatStreamService } from '../../../shared/services/chat-stream.service';

@Component({
  selector: 'app-thread-sidebar',
  templateUrl: './thread-sidebar.component.html',
  styleUrls: ['./thread-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThreadSidebarComponent implements OnChanges, OnInit, OnDestroy {
  @Input() threads: Conversation[] = [];
  @Input() currentThread: Conversation | null = null;
  @Input() collapsed = false;
  @Input() user: User | null = null;
  @Input() loading = false;
  skeletonRows = [0, 1, 2, 3, 4, 5];
  @Output() threadSelected = new EventEmitter<Conversation>();
  @Output() newThread = new EventEmitter<void>();
  @Output() workspaceNavigate = new EventEmitter<void>();
  @Output() sidebarToggled = new EventEmitter<boolean>();
  @Output() manageProfile = new EventEmitter<void>();
  @Output() logoutRequested = new EventEmitter<void>();
  @Output() renameThread = new EventEmitter<{ thread: Conversation; title: string }>();
  @Output() removeThread = new EventEmitter<Conversation>();

  threadMenuOpen: string | null = null;
  menuThread: Conversation | null = null;
  threadMenuPosition: { top: number; left: number } | null = null;
  profileMenuOpen = false;
  profileMenuPosition: { top: number; left: number } | null = null;
  profileMenuOpensLeft = false;
  menuOpensLeft = false;
  private menuTrigger: HTMLElement | null = null;
  private profileMenuTrigger: HTMLElement | null = null;

  // Search state
  searchQuery = '';
  filteredThreads: Conversation[] = [];
  private searchDebounceTimeout: any;
  private messagesCache = new Map<string, ConversationMessage[]>();
  private matchSourceByThreadId = new Map<string, 'title' | 'message' | 'both'>();
  hoveringExpandControl = false;
  private brandExpandInteraction = false;
  private toggleExpandInteraction = false;
  theme$: Observable<'light' | 'dark'>;

  activeThreads = new Set<string>();
  private sub = new Subscription();

  constructor(
    private themeService: ThemeService,
    private conversationService: ConversationService,
    private sanitizer: DomSanitizer,
    private confirmDialogService: ConfirmDialogService,
    private threadSearchPopupService: ThreadSearchPopupService,
    private chatStreamService: ChatStreamService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.theme$ = this.themeService.theme$;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('threads' in changes) {
      this.filteredThreads = this.sortThreads([...this.threads]);
      if (this.searchQuery.trim()) {
        this.applyFilter();
      }
    }

    if ('collapsed' in changes) {
      const wasCollapsed = changes['collapsed'].previousValue;
      const isCollapsed = changes['collapsed'].currentValue;

      if (!isCollapsed) {
        this.resetExpandControlState();
        if (wasCollapsed && this.profileMenuOpen) {
          this.closeProfileMenu();
        }
      }
    }
  }

  ngOnInit(): void {
    this.sub.add(this.chatStreamService.activeStreams$.subscribe(ids => {
      this.activeThreads = ids;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  handleBrandExpandInteraction(active: boolean): void {
    this.brandExpandInteraction = active;
    this.updateExpandControlState();
  }

  handleToggleExpandInteraction(active: boolean): void {
    this.toggleExpandInteraction = active;
    this.updateExpandControlState();
  }

  private updateExpandControlState(): void {
    if (!this.collapsed) {
      this.resetExpandControlState();
      return;
    }
    this.hoveringExpandControl = this.brandExpandInteraction || this.toggleExpandInteraction;
  }

  private resetExpandControlState(): void {
    this.brandExpandInteraction = false;
    this.toggleExpandInteraction = false;
    this.hoveringExpandControl = false;
  }

  selectThread(thread: Conversation): void {
    this.threadMenuOpen = null;
    this.closeProfileMenu();
    this.threadSelected.emit(thread);
  }

  createNewThread(): void {
    this.closeProfileMenu();
    this.newThread.emit();
  }

  goToWorkspace(): void {
    this.closeProfileMenu();
    this.workspaceNavigate.emit();
  }

  goToPrompts(): void {
    this.closeProfileMenu();
    this.router.navigate(['/workspace'], { queryParams: { view: 'prompts' } });
  }

  getThreadTitle(thread: Conversation): string {
    return thread.title || 'New Conversation';
  }

  isTitleMatch(thread: Conversation): boolean {
    const source = this.matchSourceByThreadId.get(thread.id);
    return source === 'title' || source === 'both';
  }

  isMessageMatch(thread: Conversation): boolean {
    const source = this.matchSourceByThreadId.get(thread.id);
    return source === 'message' || source === 'both';
  }

  getHighlightedTitle(thread: Conversation): SafeHtml {
    const title = this.getThreadTitle(thread);
    return this.highlightText(title, this.searchQuery);
  }

  getHighlightedSnippet(thread: Conversation): SafeHtml | null {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return null;
    }

    const messages = this.messagesCache.get(thread.id);
    if (!messages || !messages.length) {
      return null;
    }

    const matchingMessage = messages.find(msg =>
      (msg.content || '').toLowerCase().includes(query)
    );

    if (!matchingMessage || !matchingMessage.content) {
      return null;
    }

    const content = matchingMessage.content;
    const lowerContent = content.toLowerCase();
    const index = lowerContent.indexOf(query);

    if (index === -1) {
      return null;
    }

    const context = 40;
    const start = Math.max(0, index - context);
    const end = Math.min(content.length, index + query.length + context);

    let snippet = content.substring(start, end);

    if (start > 0) {
      snippet = '…' + snippet;
    }
    if (end < content.length) {
      snippet = snippet + '…';
    }

    return this.highlightText(snippet, this.searchQuery);
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
    }
    this.searchDebounceTimeout = setTimeout(() => {
      this.applyFilter();
      this.cdr.markForCheck();
    }, 200);
  }

  private applyFilter(): void {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      this.filteredThreads = this.sortThreads([...this.threads]);
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

    // Initial filtered list using titles and any cached message matches
    const nextFiltered = [...titleMatches, ...messageMatches];
    this.filteredThreads = this.sortThreads(nextFiltered);

    // Fetch messages for threads not yet cached — limit to 3 concurrent requests
    if (threadsNeedingFetch.length) {
      const currentQuery = query;
      from(threadsNeedingFetch).pipe(
        mergeMap(
          thread => this.conversationService.getMessages(thread.id).pipe(
            map(messages => ({ thread, messages })),
            catchError(() => of(null))
          ),
          3 // max 3 concurrent
        )
      ).subscribe({
        next: (result) => {
          if (!result) return;
          const { thread, messages } = result;
          this.messagesCache.set(thread.id, messages);
          if (this.searchQuery.trim().toLowerCase() !== currentQuery) return;
          const hasMatch = messages.some(msg =>
            (msg.content || '').toLowerCase().includes(currentQuery)
          );
          if (hasMatch && !this.filteredThreads.some(t => t.id === thread.id)) {
            this.filteredThreads = this.sortThreads([...this.filteredThreads, thread]);
            const existing = this.matchSourceByThreadId.get(thread.id);
            if (existing === 'title') {
              this.matchSourceByThreadId.set(thread.id, 'both');
            } else {
              this.matchSourceByThreadId.set(thread.id, 'message');
            }
            this.cdr.markForCheck();
          }
        }
      });
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private highlightText(text: string, query: string): SafeHtml {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      return this.sanitizer.bypassSecurityTrustHtml(text);
    }

    const pattern = this.escapeRegExp(trimmedQuery);
    const regex = new RegExp(`(${pattern})`, 'gi');
    const highlighted = text.replace(regex, '<mark class="thread-search-highlight">$1</mark>');

    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  getTitleSlice(thread: Conversation): string {
    const title = this.getThreadTitle(thread).trim();
    if (!title) {
      return 'NC';
    }
    return title
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  getInitials(first?: string, last?: string, fallback?: string): string {
    const primary = [first, last].filter(Boolean).join(' ');
    if (primary.trim()) {
      return primary
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }
    return (fallback || 'RAG').slice(0, 2).toUpperCase();
  }

  getProfileName(user: User | null): string {
    if (!user) {
      return '';
    }
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    const email = user.email || '';
    const username = email.includes('@') ? email.split('@')[0] : email;
    return username;
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Calendar day difference logic
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDiff = Math.floor((today.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    }

    if (dayDiff === 0) {
      return 'Today';
    } else if (dayDiff === 1) {
      return 'Yesterday';
    } else if (dayDiff < 7) {
      return `${dayDiff} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  getThreadDisplayTimestamp(thread: Conversation): string {
    return thread.updated_at || thread.created_at;
  }

  toggleThreadMenu(thread: Conversation, event: MouseEvent): void {
    event.stopPropagation();
    if (this.threadMenuOpen === thread.id) {
      this.closeThreadMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    trigger.focus();
    this.menuThread = thread;
    this.threadMenuOpen = thread.id;
    this.menuTrigger = trigger;
    this.closeProfileMenu();
    this.updateThreadMenuPosition();
  }

  async editThread(thread: Conversation, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    const currentTitle = this.getThreadTitle(thread);
    const updatedTitle = await this.confirmDialogService.prompt({
      title: 'Rename Chat',
      message: 'Enter a new title for this conversation:',
      promptValue: currentTitle,
      promptPlaceholder: 'Chat title...',
      confirmText: 'Rename',
      cancelText: 'Cancel'
    });

    if (updatedTitle && updatedTitle.trim() && updatedTitle.trim() !== currentTitle) {
      this.renameThread.emit({ thread, title: updatedTitle.trim() });
      this.closeThreadMenu();
    }
  }

  async deleteThread(thread: Conversation, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete chat?',
      message: 'This will delete',
      itemName: thread.title || 'this conversation'
    });
    if (confirmed) {
      this.chatStreamService.cancelStream(thread.id);
      this.removeThread.emit(thread);
      this.closeThreadMenu();
    }
  }

  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.profileMenuOpen) {
      this.closeProfileMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    trigger.focus();
    this.profileMenuTrigger = trigger;
    this.profileMenuOpen = true;
    this.closeThreadMenu();

    if (this.collapsed) {
      this.updateProfileMenuPosition();
    }
  }

  openSettings(event: MouseEvent): void {
    event.stopPropagation();
    this.closeProfileMenu();
    this.manageProfile.emit();
  }

  requestLogout(event: MouseEvent): void {
    event.stopPropagation();
    this.closeProfileMenu();
    this.logoutRequested.emit();
  }

  toggleTheme(event: MouseEvent): void {
    event.stopPropagation();
    this.themeService.toggleTheme();
    // Don't close the menu when toggling theme
  }

  @HostListener('document:click', ['$event'])
  closeMenus(event: MouseEvent): void {
    const target = event?.target as HTMLElement;
    if (target && target.closest('.thread-menu-panel')) {
      return;
    }
    if (target && target.closest('.profile-menu-panel')) {
      return;
    }
    if (target && target.closest('.profile-region')) {
      return;
    }
    this.closeThreadMenu();
    this.closeProfileMenu();
  }

  @HostListener('window:scroll')
  handleWindowScroll(): void {
    if (this.threadMenuOpen) {
      this.updateThreadMenuPosition();
    }
    if (this.profileMenuOpen && this.collapsed) {
      this.updateProfileMenuPosition();
    }
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    if (this.threadMenuOpen) {
      this.updateThreadMenuPosition();
    }
    if (this.profileMenuOpen && this.collapsed) {
      this.updateProfileMenuPosition();
    }
  }

  handleThreadsScroll(): void {
    if (this.threadMenuOpen) {
      this.updateThreadMenuPosition();
    }
  }

  toggleSidebar(forceState?: boolean, event?: MouseEvent): void {
    event?.stopPropagation();
    const nextState = typeof forceState === 'boolean' ? forceState : !this.collapsed;
    if (nextState === this.collapsed) {
      return;
    }
    if (nextState) {
      this.closeThreadMenu();
      this.closeProfileMenu();
    }
    this.sidebarToggled.emit(nextState);
  }

  openSearchPopup(event?: MouseEvent): void {
    event?.stopPropagation();
    this.threadSearchPopupService.open(this.threads, this.currentThread);
  }

  private closeThreadMenu(): void {
    this.threadMenuOpen = null;
    this.threadMenuPosition = null;
    this.menuThread = null;
    this.menuTrigger = null;
    this.menuOpensLeft = false;
  }

  private closeProfileMenu(): void {
    this.profileMenuOpen = false;
    this.profileMenuPosition = null;
    this.profileMenuTrigger = null;
    this.profileMenuOpensLeft = false;
  }

  private updateThreadMenuPosition(): void {
    if (!this.menuTrigger) {
      this.threadMenuPosition = null;
      return;
    }

    const rect = this.menuTrigger.getBoundingClientRect();
    const offset = 12;
    const assumedPanelHeight = 120;
    const assumedPanelWidth = 190;
    const viewportPadding = 12;

    let top = rect.top + rect.height / 2;
    const halfHeight = assumedPanelHeight / 2;
    const minTop = viewportPadding + halfHeight;
    const maxTop = window.innerHeight - halfHeight - viewportPadding;
    top = Math.min(Math.max(top, minTop), maxTop);

    this.menuOpensLeft = false;
    let left = rect.right + offset;
    const maxLeft = window.innerWidth - assumedPanelWidth - viewportPadding;
    if (left > maxLeft) {
      left = Math.max(rect.left - offset - assumedPanelWidth, viewportPadding);
      this.menuOpensLeft = true;
    }

    this.threadMenuPosition = { top, left };
  }

  trackByThreadId(index: number, thread: Conversation): string {
    return thread.id;
  }

  private updateProfileMenuPosition(): void {
    if (!this.profileMenuTrigger) {
      this.profileMenuPosition = null;
      return;
    }

    const rect = this.profileMenuTrigger.getBoundingClientRect();
    const offset = 12;
    const assumedPanelHeight = 140; // Increased for theme toggle button
    const assumedPanelWidth = 180;
    const viewportPadding = 12;

    let top = rect.top + rect.height / 2;
    const halfHeight = assumedPanelHeight / 2;
    const minTop = viewportPadding + halfHeight;
    const maxTop = window.innerHeight - halfHeight - viewportPadding;
    top = Math.min(Math.max(top, minTop), maxTop);

    this.profileMenuOpensLeft = false;
    let left = rect.right + offset;
    const maxLeft = window.innerWidth - assumedPanelWidth - viewportPadding;
    if (left > maxLeft) {
      left = Math.max(rect.left - offset - assumedPanelWidth, viewportPadding);
      this.profileMenuOpensLeft = true;
    }

    this.profileMenuPosition = { top, left };
  }

  isPinned(thread: Conversation): boolean {
    return !!thread.is_pinned;
  }

  togglePin(thread: Conversation, event?: MouseEvent): void {
    event?.stopPropagation();
    this.closeThreadMenu();

    const previousPinnedState = !!thread.is_pinned;
    thread.is_pinned = !previousPinnedState;
    this.filteredThreads = this.sortThreads([...this.filteredThreads]);
    this.cdr.markForCheck();

    this.conversationService.patch(thread.id, { is_pinned: thread.is_pinned }).subscribe({
      next: (updatedThread) => {
        thread.is_pinned = updatedThread.is_pinned;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to update pin status', err);
        thread.is_pinned = previousPinnedState;
        this.filteredThreads = this.sortThreads([...this.filteredThreads]);
        this.cdr.markForCheck();
      }
    });
  }

  toggleDataGrid(thread: Conversation, event?: MouseEvent): void {
    event?.stopPropagation();

    const previousState = !!thread.enable_data_grid;
    thread.enable_data_grid = !previousState;
    this.cdr.markForCheck();

    this.conversationService.patch(thread.id, { enable_data_grid: thread.enable_data_grid }).subscribe({
      next: (updatedThread) => {
        thread.enable_data_grid = updatedThread.enable_data_grid;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to update data grid toggle status', err);
        thread.enable_data_grid = previousState;
        this.cdr.markForCheck();
      }
    });
  }

  isProcessing(threadId: string): boolean {
    return this.activeThreads.has(threadId);
  }

  private sortThreads(threads: Conversation[]): Conversation[] {
    return threads.sort((a, b) => {
      const aPinned = !!a.is_pinned;
      const bPinned = !!b.is_pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const timeA = new Date(this.getThreadDisplayTimestamp(a)).getTime() || 0;
      const timeB = new Date(this.getThreadDisplayTimestamp(b)).getTime() || 0;
      return timeB - timeA;
    });
  }
}
