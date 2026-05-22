import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { HttpEvent, HttpContext } from '@angular/common/http';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { Document, DocumentIngestRequest, DocumentStatus, DocumentPreview, IngestResponse, DocumentMoveRequest, DocumentMoveResponse } from '../models/document.model';
import { HttpParams } from '@angular/common/http';
import { shareReplay, tap } from 'rxjs/operators';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';
import { SKIP_API_ERROR_ALERT } from '../interceptors/api-error-alert.interceptor';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private listCache = new Map<string, Observable<Document[]>>();
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

  ingest(data: DocumentIngestRequest): Observable<Document | IngestResponse> {
    const token = this.getToken();
    const formData = new FormData();

    if (data.files && data.files.length > 0) {
      data.files.forEach(file => formData.append('files', file));
    }
    if (data.s3_file_url) {
      formData.append('s3_file_url', data.s3_file_url);
    }
    if (data.vector_store_id) {
      formData.append('vector_store_id', data.vector_store_id);
    }

    return this.api.postFormData<Document | IngestResponse>(`/document/${token}/batch-ingest/`, formData, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  ingestWithProgress(data: DocumentIngestRequest): Observable<HttpEvent<Document | IngestResponse>> {
    const token = this.getToken();
    const formData = new FormData();

    if (data.files && data.files.length > 0) {
      data.files.forEach(file => formData.append('files', file));
    }
    if (data.s3_file_url) {
      formData.append('s3_file_url', data.s3_file_url);
    }
    if (data.vector_store_id) {
      formData.append('vector_store_id', data.vector_store_id);
    }

    // When ingest completes, the caller typically refreshes lists; we still clear caches up-front
    // so subsequent list() calls won't reuse stale data.
    this.invalidateListCache();

    // Skip global loading spinner to prevent flickering during multi-file uploads
    const context = new HttpContext().set(SKIP_LOADING, true);
    return this.api.postFormDataWithProgress<Document | IngestResponse>(`/document/${token}/batch-ingest/`, formData, token, context);
  }

  list(vectorStoreId?: string, forceRefresh = false): Observable<Document[]> {
    const token = this.getToken();
    if (forceRefresh) {
      this.invalidateListCache();
    }
    // Invalidate cache if the active user changed since the cache was built.
    if (this.listCache.size > 0 && !this.userState.isCurrentUser(this.cachedForUserId)) {
      this.invalidateListCache();
    }
    let params = new HttpParams();
    if (vectorStoreId) {
      params = params.set('vector_store_id', vectorStoreId);
    }

    const cacheKey = vectorStoreId ? `vectorStore:${vectorStoreId}` : 'all';
    const existing = this.listCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    this.cachedForUserId = this.userState.currentUserId;
    const req$ = this.api.get<Document[]>(`/document/${token}/list/`, token, params).pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.listCache.set(cacheKey, req$);
    return req$;
  }

  getById(id: string): Observable<Document> {
    const token = this.getToken();
    return this.api.get<Document>(`/document/${token}/${id}/`, token);
  }

  getStatus(documentId: string): Observable<DocumentStatus> {
    const token = this.getToken();
    const context = new HttpContext()
      .set(SKIP_LOADING, true)
      .set(SKIP_API_ERROR_ALERT, true);
    return this.api.get<DocumentStatus>(`/document/${token}/${documentId}/status/`, token, undefined, context);
  }

  /**
   * Fetches a lightweight preview (title, snippet, keywords) for a document.
   * Used for hover previews in the chat composer. Suppresses the global loader and
   * error toasts since these requests are speculative.
   */
  getPreview(documentId: string, chars: number = 600): Observable<DocumentPreview> {
    const token = this.getToken();
    const context = new HttpContext()
      .set(SKIP_LOADING, true)
      .set(SKIP_API_ERROR_ALERT, true);
    const params = new HttpParams().set('chars', String(chars));
    return this.api.get<DocumentPreview>(`/document/${token}/${documentId}/preview/`, token, params, context);
  }

  update(id: string, data: Partial<Document>): Observable<Document> {
    const token = this.getToken();
    return this.api.put<Document>(`/document/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  move(data: DocumentMoveRequest): Observable<DocumentMoveResponse> {
    const token = this.getToken();
    return this.api.post<DocumentMoveResponse>(`/documents/move/${token}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/document/${token}/${id}/`, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  bulkDelete(ids: string[]): Observable<void[]> {
    const deletions = ids.map(id => this.delete(id));
    return forkJoin(deletions).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  invalidateListCache(): void {
    this.listCache.clear();
    this.cachedForUserId = null;
  }
}
