import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Thread, ThreadCreateRequest } from '../models/thread.model';
import { Message } from '../models/message.model';

@Injectable({
  providedIn: 'root'
})
export class ThreadService {
  private threadsCache$?: Observable<Thread[]>;

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  create(data: ThreadCreateRequest): Observable<Thread> {
    const token = this.getToken();
    return this.api.post<Thread>(`/thread/${token}/`, data, token).pipe(
      tap(() => this.invalidateThreadsCache())
    );
  }

  list(): Observable<Thread[]> {
    const token = this.getToken();
    if (!this.threadsCache$) {
      this.threadsCache$ = this.api.get<Thread[]>(`/thread/${token}/list/`, token).pipe(
        // Cache latest value so navigating between /home and /home/chat/:id doesn't refetch unnecessarily
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.threadsCache$;
  }

  getById(id: string): Observable<Thread> {
    const token = this.getToken();
    return this.api.get<Thread>(`/thread/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<ThreadCreateRequest>): Observable<Thread> {
    const token = this.getToken();
    return this.api.put<Thread>(`/thread/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateThreadsCache())
    );
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/thread/${token}/${id}/`, token).pipe(
      tap(() => this.invalidateThreadsCache())
    );
  }

  getMessages(threadId: string): Observable<Message[]> {
    const token = this.getToken();
    return this.api.get<Message[]>(`/thread/${token}/${threadId}/messages/`, token);
  }

  invalidateThreadsCache(): void {
    this.threadsCache$ = undefined;
  }
}

