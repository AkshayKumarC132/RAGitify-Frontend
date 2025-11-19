import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { Thread } from '../../../shared/models/thread.model';
import { User } from '../../../shared/models/user.model';

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
  @Output() renameThread = new EventEmitter<{ thread: Thread; title: string }>();
  @Output() removeThread = new EventEmitter<Thread>();

  threadMenuOpen: string | null = null;

  selectThread(thread: Thread): void {
    this.threadMenuOpen = null;
    this.threadSelected.emit(thread);
  }

  createNewThread(): void {
    this.newThread.emit();
  }

  goToWorkspace(): void {
    this.workspaceNavigate.emit();
  }

  toggleSidebar(): void {
    this.sidebarToggled.emit(!this.collapsed);
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
    this.threadMenuOpen = this.threadMenuOpen === thread.id ? null : thread.id;
  }

  editThread(thread: Thread, event?: MouseEvent): void {
    event?.stopPropagation();
    const currentTitle = this.getThreadTitle(thread);
    const updatedTitle = window.prompt('Edit thread title', currentTitle);
    if (updatedTitle && updatedTitle.trim() && updatedTitle.trim() !== currentTitle) {
      this.renameThread.emit({ thread, title: updatedTitle.trim() });
      this.threadMenuOpen = null;
    }
  }

  deleteThread(thread: Thread, event?: MouseEvent): void {
    event?.stopPropagation();
    const confirmed = window.confirm('Delete this conversation?');
    if (confirmed) {
      this.removeThread.emit(thread);
      this.threadMenuOpen = null;
    }
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.threadMenuOpen = null;
  }
}
