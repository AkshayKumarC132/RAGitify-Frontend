import { Component, Input, Output, EventEmitter, HostListener, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { Thread } from '../../../shared/models/thread.model';
import { User } from '../../../shared/models/user.model';
import { Message } from '../../../shared/models/message.model';
import { ThemeService } from '../../../shared/services/theme.service';
import { ThreadService } from '../../../shared/services/thread.service';

@Component({
  selector: 'app-thread-sidebar',
  templateUrl: './thread-sidebar.component.html',
  styleUrls: ['./thread-sidebar.component.scss']
})
export class ThreadSidebarComponent implements OnChanges {
  @Input() threads: Thread[] = [];
  @Input() currentThread: Thread | null = null;
  @Input() collapsed = false;
  @Input() user: User | null = null;
  @Output() threadSelected = new EventEmitter<Thread>();
  @Output() newThread = new EventEmitter<void>();
  @Output() workspaceNavigate = new EventEmitter<void>();
  @Output() sidebarToggled = new EventEmitter<boolean>();
  @Output() manageProfile = new EventEmitter<void>();
  @Output() logoutRequested = new EventEmitter<void>();
  @Output() renameThread = new EventEmitter<{ thread: Thread; title: string }>();
  @Output() removeThread = new EventEmitter<Thread>();

  threadMenuOpen: string | null = null;
  menuThread: Thread | null = null;
  threadMenuPosition: { top: number; left: number } | null = null;
  profileMenuOpen = false;
  profileMenuPosition: { top: number; left: number } | null = null;
  profileMenuOpensLeft = false;
  menuOpensLeft = false;
  private menuTrigger: HTMLElement | null = null;
  private profileMenuTrigger: HTMLElement | null = null;

  // Search state
  searchQuery = '';
  filteredThreads: Thread[] = [];
  private searchDebounceTimeout: any;
  private messagesCache = new Map<string, Message[]>();
  private matchSourceByThreadId = new Map<string, 'title' | 'message' | 'both'>();
  hoveringExpandControl = false;
  private brandExpandInteraction = false;
  private toggleExpandInteraction = false;
  theme$: Observable<'light' | 'dark'>;

  constructor(
    private themeService: ThemeService,
    private threadService: ThreadService,
    private sanitizer: DomSanitizer
  ) {
    this.theme$ = this.themeService.theme$;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('threads' in changes) {
      // Whenever the input threads change, reset the filtered list
      this.filteredThreads = [...this.threads];
      // Re-apply current search query if any
      if (this.searchQuery.trim()) {
        this.applyFilter();
      }
    }

    if ('collapsed' in changes) {
      const wasCollapsed = changes['collapsed'].previousValue;
      const isCollapsed = changes['collapsed'].currentValue;
      
      if (!isCollapsed) {
        this.resetExpandControlState();
        // Close profile menu when expanding (transitioning from collapsed to expanded)
        if (wasCollapsed && this.profileMenuOpen) {
          this.closeProfileMenu();
        }
      }
    }
    if ('user' in changes) {
      const nextUser = changes['user'].currentValue as User | null;
      if (!nextUser) {
        console.warn('[ThreadSidebar] profile region hidden - no user data available', {
          hasToken: !!localStorage.getItem('auth_token'),
          storedUser: localStorage.getItem('current_user') ? 'present' : 'missing'
        });
      } else {
        console.log('[ThreadSidebar] profile region ready for user', {
          email: nextUser.email,
          hasFirstName: !!nextUser.first_name,
          hasLastName: !!nextUser.last_name
        });
      }
    }
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

  selectThread(thread: Thread): void {
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

  getThreadTitle(thread: Thread): string {
    return thread.title || 'New Conversation';
  }

  isTitleMatch(thread: Thread): boolean {
    const source = this.matchSourceByThreadId.get(thread.id);
    return source === 'title' || source === 'both';
  }

  isMessageMatch(thread: Thread): boolean {
    const source = this.matchSourceByThreadId.get(thread.id);
    return source === 'message' || source === 'both';
  }

  getHighlightedTitle(thread: Thread): SafeHtml {
    const title = this.getThreadTitle(thread);
    return this.highlightText(title, this.searchQuery);
  }

  getHighlightedSnippet(thread: Thread): SafeHtml | null {
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
    }, 200);
  }

  private applyFilter(): void {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      this.filteredThreads = [...this.threads];
      this.matchSourceByThreadId.clear();
      return;
    }

    this.matchSourceByThreadId.clear();

    const titleMatches: Thread[] = [];
    const remainingThreads: Thread[] = [];

    for (const thread of this.threads) {
      const title = this.getThreadTitle(thread).toLowerCase();
      if (title.includes(query)) {
        titleMatches.push(thread);
        this.matchSourceByThreadId.set(thread.id, 'title');
      } else {
        remainingThreads.push(thread);
      }
    }

    const messageMatches: Thread[] = [];
    const threadsNeedingFetch: Thread[] = [];

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
    this.filteredThreads = nextFiltered;

    // Fetch messages for threads we haven't loaded yet
    if (threadsNeedingFetch.length) {
      const currentQuery = query;
      for (const thread of threadsNeedingFetch) {
        this.threadService.getMessages(thread.id).subscribe({
          next: (messages) => {
            this.messagesCache.set(thread.id, messages);
            // Only apply results if the search query hasn't changed
            if (this.searchQuery.trim().toLowerCase() !== currentQuery) {
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
            // Fail silently for search; title-based filtering still works
          }
        });
      }
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

  getTitleSlice(thread: Thread): string {
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
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      return 'Just now';
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  toggleThreadMenu(thread: Thread, event: MouseEvent): void {
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

  editThread(thread: Thread, event?: MouseEvent): void {
    event?.stopPropagation();
    const currentTitle = this.getThreadTitle(thread);
    const updatedTitle = window.prompt('Edit thread title', currentTitle);
    if (updatedTitle && updatedTitle.trim() && updatedTitle.trim() !== currentTitle) {
      this.renameThread.emit({ thread, title: updatedTitle.trim() });
      this.closeThreadMenu();
    }
  }

  deleteThread(thread: Thread, event?: MouseEvent): void {
    event?.stopPropagation();
    const confirmed = window.confirm('Delete this conversation?');
    if (confirmed) {
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

  trackByThreadId(index: number, thread: Thread): string {
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
}
