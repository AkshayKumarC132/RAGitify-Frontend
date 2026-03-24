import { Injectable, NgZone } from '@angular/core';
import { Observable, interval, of } from 'rxjs';
import { switchMap, takeWhile, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { HttpContext } from '@angular/common/http';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';
import { ResponseRecord, ResponseCreateRequest, StreamEvent } from '../models/response.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ResponseService {
  constructor(
    private api: ApiService,
    private auth: AuthService,
    private ngZone: NgZone
  ) { }

  getDefaultModel(): string {
    // 1. Read the active model cached in localStorage (populated on login & model change)
    const cached = this.auth.getActiveModel();
    if (cached) {
      return cached;
    }

    // 2. Fallback: derive from stored user's provider info
    const storedUser = this.auth.getStoredUser() as any;
    const provider = storedUser?.active_provider
      || storedUser?.selected_llm_provider
      || (typeof storedUser?.active_collection === 'object' ? storedUser?.active_collection?.provider : null)
      || null;

    if (provider === 'Ollama') {
      return 'llama3.1:latest';
    }

    // Default for OpenAI or unknown provider
    return 'gpt-4.1';
  }

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  create(data: ResponseCreateRequest): Observable<ResponseRecord> {
    const token = this.getToken();
    const payload = data.model ? { ...data, stream: true } : { ...data, model: this.getDefaultModel(), stream: true };
    return this.api.post<ResponseRecord>(`/response/chat/${token}/`, payload, token);
  }

  createStream(data: ResponseCreateRequest): Observable<StreamEvent> {
    const token = this.getToken();
    const payload = data.model ? { ...data, stream: true } : { ...data, model: this.getDefaultModel(), stream: true };
    const url = `${environment.apiUrl}/response/chat/${token}/`;

    return new Observable<StreamEvent>(subscriber => {
      let aborted = false;
      const controller = new AbortController();

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).then(async response => {
        if (!response.ok) {
          this.ngZone.run(() => subscriber.error(new Error(`Stream request failed: ${response.status}`)));
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              currentEventType = ''; // Reset on empty lines bounding SSE events
              continue;
            }

            if (trimmed.startsWith('event:')) {
              currentEventType = trimmed.slice(6).trim();
              continue;
            }

            if (!trimmed.startsWith('data:')) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr === '[DONE]') {
              this.ngZone.run(() => subscriber.complete());
              return;
            }

            try {
              const eventPayload = JSON.parse(jsonStr);
              const eventType: string = currentEventType || eventPayload.type || '';

              if (eventType === 'response.output_text.delta') {
                this.ngZone.run(() => subscriber.next({ type: 'delta', delta: eventPayload.delta || '' }));
              } else if (eventType === 'response.completed') {
                this.ngZone.run(() => {
                  subscriber.next({
                    type: 'completed',
                    response: eventPayload,
                    warnings: eventPayload?.warnings
                  });
                  subscriber.complete();
                });
                return;
              } else if (eventType === 'response.failed') {
                this.ngZone.run(() => {
                  subscriber.next({
                    type: 'failed',
                    response: eventPayload
                  });
                  subscriber.complete();
                });
                return;
              }
            } catch (e) {
              // skip unparseable lines
            }
          }
        }

        this.ngZone.run(() => subscriber.complete());
      }).catch(err => {
        if (!aborted) {
          this.ngZone.run(() => subscriber.error(err));
        }
      });

      return () => {
        aborted = true;
        controller.abort();
      };
    });
  }

  getById(id: string, skipLoading: boolean = false): Observable<ResponseRecord> {
    const token = this.getToken();
    const context = new HttpContext().set(SKIP_LOADING, skipLoading);
    return this.api.get<ResponseRecord>(`/response/${token}/${id}/`, token, undefined, context);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/response/${token}/${id}/`, token);
  }

  cancel(responseId: string): Observable<any> {
    const token = this.getToken();
    return this.api.post<any>(`/response/${token}/${responseId}/cancel/`, {}, token);
  }

  pollResponseStatus(responseId: string): Observable<ResponseRecord> {
    return interval(2000).pipe(
      switchMap(() => this.getById(responseId, true)),
      takeWhile(
        (response) => response?.status === 'in_progress',
        true // inclusive - emit the last value even if it doesn't match
      ),
      catchError((error) => {
        console.error('Error polling response status:', error);
        return of(null as any);
      })
    );
  }
}
