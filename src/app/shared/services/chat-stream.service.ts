import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { ConversationMessage } from '../models/conversation.model';
import { StreamEvent, ResponseCreateRequest } from '../models/response.model';
import { ResponseService } from './response.service';

export interface ActiveStreamState {
  threadId: string;
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

  constructor(private responseService: ResponseService) { }

  ngOnDestroy(): void {
    this.clearAllStreams();
  }

  startStream(
    threadId: string,
    request: ResponseCreateRequest,
    userMessage: ConversationMessage,
    assistantMessage: ConversationMessage
  ): Subject<StreamEvent> {
    this.cancelStream(threadId); // Clear any existing stream for this thread

    const eventSubject = new Subject<StreamEvent>();
    const state: ActiveStreamState = {
      threadId,
      userMessage,
      assistantMessage,
      eventSubject,
      runStatus: 'in_progress',
      warnings: [],
      error: null,
      subscription: new Subscription() // placeholder
    };

    this.activeStreams.set(threadId, state);

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
        } else if (event.type === 'failed') {
          state.runStatus = 'failed';
          state.error = event.response?.error_message || 'Response failed';
        }
        eventSubject.next(event);
      },
      error: (err) => {
        state.runStatus = 'failed';
        state.error = err.message || 'Failed to send message';
        eventSubject.error(err);
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
    }
  }

  clearAllStreams(): void {
    for (const [threadId, state] of this.activeStreams.entries()) {
      state.subscription.unsubscribe();
      state.eventSubject.complete();
    }
    this.activeStreams.clear();
  }
}
