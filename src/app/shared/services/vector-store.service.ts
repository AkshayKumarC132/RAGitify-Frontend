import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { VectorStore, VectorStoreCreateRequest } from '../models/vector-store.model';

@Injectable({
  providedIn: 'root'
})
export class VectorStoreService {
  private listCache$?: Observable<VectorStore[]>;
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

  create(data: VectorStoreCreateRequest): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.post<VectorStore>(`/vector-store/${token}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  list(forceRefresh = false): Observable<VectorStore[]> {
    const token = this.getToken();
    if (forceRefresh) {
      this.invalidateListCache();
    }
    // Invalidate cache if the active user changed since the cache was built.
    if (this.listCache$ && !this.userState.isCurrentUser(this.cachedForUserId)) {
      this.invalidateListCache();
    }
    if (!this.listCache$) {
      this.cachedForUserId = this.userState.currentUserId;
      this.listCache$ = this.api.get<VectorStore[]>(`/vector-store/${token}/list/`, token).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.listCache$;
  }

  getById(id: string): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.get<VectorStore>(`/vector-store/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<VectorStoreCreateRequest>): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.put<VectorStore>(`/vector-store/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  delete(id: string, options?: { hardDelete?: boolean }): Observable<void> {
    const token = this.getToken();
    const query = options?.hardDelete ? '?hard_delete=true' : '';
    return this.api.delete<void>(`/vector-store/${token}/${id}/${query}`, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  invalidateListCache(): void {
    this.listCache$ = undefined;
    this.cachedForUserId = null;
  }
}
