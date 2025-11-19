import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Thread } from '../../../shared/models/thread.model';

@Component({
  selector: 'app-thread-sidebar',
  templateUrl: './thread-sidebar.component.html',
  styleUrls: ['./thread-sidebar.component.scss']
})
export class ThreadSidebarComponent {
  @Input() threads: Thread[] = [];
  @Input() currentThread: Thread | null = null;
  @Output() threadSelected = new EventEmitter<Thread>();
  @Output() newThread = new EventEmitter<void>();
  @Output() workspaceNavigate = new EventEmitter<void>();

  selectThread(thread: Thread): void {
    this.threadSelected.emit(thread);
  }

  createNewThread(): void {
    this.newThread.emit();
  }

  goToWorkspace(): void {
    this.workspaceNavigate.emit();
  }

  getThreadTitle(thread: Thread): string {
    return thread.title || 'New Conversation';
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
}
