import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { OpenAIKey, OpenAIKeyCreateRequest } from '../models/openai-key.model';

@Injectable({
  providedIn: 'root'
})
export class OpenAIKeyService {
  private listCache$?: Observable<OpenAIKey[]>;
  private cachedForUserId: number | null = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private userState: UserStateService
  ) {
    this.userState.registerResetFn(() => this.invalidateListCache());
  }

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  create(data: OpenAIKeyCreateRequest): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.post<OpenAIKey>(`/llm-config/${token}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  list(): Observable<OpenAIKey[]> {
    const token = this.getToken();
    // Invalidate cache if the active user changed since the cache was built.
    if (this.listCache$ && !this.userState.isCurrentUser(this.cachedForUserId)) {
      this.invalidateListCache();
    }
    if (!this.listCache$) {
      this.cachedForUserId = this.userState.currentUserId;
      this.listCache$ = this.api.get<OpenAIKey[]>(`/llm-config/${token}/list/`, token).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.listCache$;
  }

  getById(id: number): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.get<OpenAIKey>(`/llm-config/${token}/${id}/`, token);
  }

  update(id: number, data: Partial<OpenAIKeyCreateRequest>): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.put<OpenAIKey>(`/llm-config/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  delete(id: number): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/llm-config/${token}/${id}/`, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  invalidateListCache(): void {
    this.listCache$ = undefined;
    this.cachedForUserId = null;
  }
}
