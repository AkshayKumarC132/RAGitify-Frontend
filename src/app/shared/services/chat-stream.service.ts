import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { ConversationMessage } from '../models/conversation.model';
import { StreamEvent, ResponseCreateRequest } from '../models/response.model';
import { ResponseService } from './response.service';
import { ToastService } from './toast.service';

export interface ActiveStreamState {
  threadId: string;
  threadTitle?: string;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  subscription: Subscription;
  eventSubject: Subject<StreamEvent>;
  runStatus: string;
  warnings: string[];
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ChatStreamService implements OnDestroy {
  private activeStreams = new Map<string, ActiveStreamState>();
  private activeStreamIdsSubject = new BehaviorSubject<Set<string>>(new Set());
  public activeStreams$ = this.activeStreamIdsSubject.asObservable();
  private _activeThreadId: string | null = null;

  public setActiveThreadId(id: string | null): void {
    this._activeThreadId = id;
  }

  constructor(private responseService: ResponseService, private router: Router, private toastService: ToastService) { }

  ngOnDestroy(): void {
    this.clearAllStreams();
  }

  startStream(
    threadId: string,
    request: ResponseCreateRequest,
    userMessage: ConversationMessage,
    assistantMessage: ConversationMessage,
    threadTitle?: string
  ): Subject<StreamEvent> {
    this.cancelStream(threadId); // Clear any existing stream for this thread

    const eventSubject = new Subject<StreamEvent>();
    const state: ActiveStreamState = {
      threadId,
      threadTitle,
      userMessage,
      assistantMessage,
      eventSubject,
      runStatus: 'in_progress',
      warnings: [],
      error: null,
      subscription: new Subscription() // placeholder
    };

    this.activeStreams.set(threadId, state);
    this.updateActiveStreamsSubject();

    state.subscription = this.responseService.createStream(request).subscribe({
      next: (event: StreamEvent) => {
        if (event.type === 'delta' && event.delta) {
          state.assistantMessage.content += event.delta;
        } else if (event.type === 'completed') {
          state.runStatus = 'completed';
          state.warnings = event.warnings || [];
          if (event.response?.output?.[0]?.metadata) {
            state.assistantMessage.metadata = {
              ...(state.assistantMessage.metadata || {}),
              ...event.response.output[0].metadata
            };
          }
          this.updateActiveStreamsSubject();
          this.showCompletionToast(state);
        } else if (event.type === 'failed') {
          state.runStatus = 'failed';
          state.error = event.response?.error_message || 'Response failed';
          this.updateActiveStreamsSubject();
        }
        eventSubject.next(event);
      },
      error: (err) => {
        state.runStatus = 'failed';
        state.error = err.payload?.error || err.message || 'Failed to send message';
        const updatedErr = Object.assign(err, { payload: err.payload });
        this.updateActiveStreamsSubject();
        eventSubject.error(updatedErr);
      },
      complete: () => {
        eventSubject.complete();
        // Keep the state around so the UI can reconnect and see the completed/failed state
        // The component is responsible for clearing it if needed, or we just leave it in memory
        // until the thread is destroyed or new message sent.
      }
    });

    return eventSubject;
  }

  getStreamState(threadId: string): ActiveStreamState | undefined {
    return this.activeStreams.get(threadId);
  }

  cancelStream(threadId: string): void {
    const state = this.activeStreams.get(threadId);
    if (state) {
      state.subscription.unsubscribe();
      state.eventSubject.complete();
      this.activeStreams.delete(threadId);
      this.updateActiveStreamsSubject();
    }
  }

  clearStreamState(threadId: string): void {
    const state = this.activeStreams.get(threadId);
    if (state) {
      if (!state.subscription.closed) {
        state.subscription.unsubscribe();
      }
      state.eventSubject.complete();
      this.activeStreams.delete(threadId);
      this.updateActiveStreamsSubject();
    }
  }

  clearAllStreams(): void {
    for (const [threadId, state] of this.activeStreams.entries()) {
      state.subscription.unsubscribe();
      state.eventSubject.complete();
    }
    this.activeStreams.clear();
    this.updateActiveStreamsSubject();
  }

  private updateActiveStreamsSubject(): void {
    const activeIds = new Set<string>();
    for (const [id, state] of this.activeStreams.entries()) {
      if (state.runStatus === 'in_progress') {
        activeIds.add(id);
      }
    }
    this.activeStreamIdsSubject.next(activeIds);
  }

  private showCompletionToast(state: ActiveStreamState): void {
    const currentUrl = this.router.url;
    if (this._activeThreadId === state.threadId || currentUrl.includes(`/home/chat/${state.threadId}`)) {
      return;
    }

    const title = state.threadTitle || 'Conversation completed';
    const msg = state.assistantMessage.content || '';
    const snippet = msg.substring(0, 80) + (msg.length > 80 ? '...' : '');

    this.toastService.show({
      title,
      message: snippet,
      threadId: state.threadId
    });
  }
}
