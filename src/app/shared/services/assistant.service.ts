import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { Assistant, AssistantCreateRequest } from '../models/assistant.model';

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
  private listCache$?: Observable<Assistant[]>;
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

  create(data: AssistantCreateRequest): Observable<Assistant> {
    const token = this.getToken();
    return this.api.post<Assistant>(`/assistant/${token}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  list(): Observable<Assistant[]> {
    const token = this.getToken();
    // Invalidate cache if the active user changed since the cache was built.
    if (this.listCache$ && !this.userState.isCurrentUser(this.cachedForUserId)) {
      this.invalidateListCache();
    }
    if (!this.listCache$) {
      this.cachedForUserId = this.userState.currentUserId;
      this.listCache$ = this.api.get<Assistant[]>(`/assistant/${token}/list/`, token).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.listCache$;
  }

  getById(id: string): Observable<Assistant> {
    const token = this.getToken();
    return this.api.get<Assistant>(`/assistant/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<AssistantCreateRequest>): Observable<Assistant> {
    const token = this.getToken();
    return this.api.put<Assistant>(`/assistant/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/assistant/${token}/${id}/`, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  invalidateListCache(): void {
    this.listCache$ = undefined;
    this.cachedForUserId = null;
  }
}
