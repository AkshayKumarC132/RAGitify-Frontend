import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { Thread } from '../../../shared/models/thread.model';
import { User } from '../../../shared/models/user.model';

interface ThreadMenuPosition {
  top: number;
  left: number;
}

@Component({
  selector: 'app-thread-sidebar',
  templateUrl: './thread-sidebar.component.html',
  styleUrls: ['./thread-sidebar.component.scss']
})
export class ThreadSidebarComponent {
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
  threadMenuPosition: ThreadMenuPosition | null = null;
  profileMenuOpen = false;
  private readonly menuDimensions = { width: 180, height: 96, margin: 16 };

  selectThread(thread: Thread): void {
    this.threadMenuOpen = null;
    this.threadMenuPosition = null;
    this.profileMenuOpen = false;
    this.threadSelected.emit(thread);
  }

  createNewThread(): void {
    this.profileMenuOpen = false;
    this.newThread.emit();
  }

  goToWorkspace(): void {
    this.profileMenuOpen = false;
    this.workspaceNavigate.emit();
  }

  getThreadTitle(thread: Thread): string {
    return thread.title || 'New Conversation';
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
    return user.username;
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
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    let left = rect.right + 12;
    if (left + this.menuDimensions.width + this.menuDimensions.margin > viewportWidth) {
      left = rect.left - this.menuDimensions.width - 12;
    }

    const centerOffset = rect.height / 2;
    let top = rect.top + scrollY + centerOffset - this.menuDimensions.height / 2;
    const minTop = scrollY + this.menuDimensions.margin;
    const maxTop = scrollY + viewportHeight - this.menuDimensions.height - this.menuDimensions.margin;
    top = Math.max(minTop, Math.min(maxTop, top));

    this.threadMenuOpen = thread.id;
    this.threadMenuPosition = { top, left };
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
    this.profileMenuOpen = !this.profileMenuOpen;
    this.closeThreadMenu();
  }

  openSettings(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen = false;
    this.manageProfile.emit();
  }

  requestLogout(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen = false;
    this.logoutRequested.emit();
  }

  @HostListener('document:click', ['$event'])
  closeMenus(event: MouseEvent): void {
    const target = event?.target as HTMLElement;
    if (target && target.closest('.thread-menu-panel')) {
      return;
    }
    if (target && target.closest('.profile-region')) {
      return;
    }
    this.closeThreadMenu();
    this.profileMenuOpen = false;
  }

  toggleSidebar(forceState?: boolean, event?: MouseEvent): void {
    event?.stopPropagation();
    const nextState = typeof forceState === 'boolean' ? forceState : !this.collapsed;
    if (nextState === this.collapsed) {
      return;
    }
    if (nextState) {
      this.closeThreadMenu();
      this.profileMenuOpen = false;
    }
    this.sidebarToggled.emit(nextState);
  }

  private closeThreadMenu(): void {
    this.threadMenuOpen = null;
    this.threadMenuPosition = null;
  }
}
