import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ResponseAttentionService {
  private readonly baseTitle = typeof document !== 'undefined' ? document.title : 'RAGitify';
  private unreadResponses = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.clearUnread();
        }
      });
    }
  }

  notifyResponseReady(context: string, message?: string): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (!document.hidden) {
      return;
    }

    this.unreadResponses += 1;
    this.updateTitle();

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(context, {
        body: this.buildNotificationBody(message),
        tag: `ragitify-response-${Date.now()}`,
        silent: false
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  private clearUnread(): void {
    this.unreadResponses = 0;
    this.updateTitle();
  }

  private updateTitle(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = this.unreadResponses > 0
      ? `(${this.unreadResponses}) ${this.baseTitle}`
      : this.baseTitle;
  }

  private buildNotificationBody(message?: string): string {
    const normalized = (message || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'Assistant response is ready.';
    }
    return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
  }
}
