import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpEvent, HttpContext } from '@angular/common/http';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Document, DocumentIngestRequest, DocumentStatus } from '../models/document.model';
import { HttpParams } from '@angular/common/http';
import { shareReplay, tap } from 'rxjs/operators';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private listCache = new Map<string, Observable<Document[]>>();

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

  ingest(data: DocumentIngestRequest): Observable<Document> {
    const token = this.getToken();
    const formData = new FormData();

    if (data.file) {
      formData.append('file', data.file);
    }
    if (data.s3_file_url) {
      formData.append('s3_file_url', data.s3_file_url);
    }
    formData.append('vector_store_id', data.vector_store_id);

    return this.api.postFormData<Document>(`/document/${token}/ingest/`, formData, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  ingestWithProgress(data: DocumentIngestRequest): Observable<HttpEvent<Document>> {
    const token = this.getToken();
    const formData = new FormData();

    if (data.file) {
      formData.append('file', data.file);
    }
    if (data.s3_file_url) {
      formData.append('s3_file_url', data.s3_file_url);
    }
    formData.append('vector_store_id', data.vector_store_id);

    // When ingest completes, the caller typically refreshes lists; we still clear caches up-front
    // so subsequent list() calls won't reuse stale data.
    this.invalidateListCache();
    return this.api.postFormDataWithProgress<Document>(`/document/${token}/ingest/`, formData, token);
  }

  list(vectorStoreId?: string, forceRefresh = false): Observable<Document[]> {
    const token = this.getToken();
    if (forceRefresh) {
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
    const context = new HttpContext().set(SKIP_LOADING, true);
    return this.api.get<DocumentStatus>(`/document/${token}/${documentId}/status/`, token, undefined, context);
  }

  update(id: string, data: Partial<Document>): Observable<Document> {
    const token = this.getToken();
    return this.api.put<Document>(`/document/${token}/${id}/`, data, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/document/${token}/${id}/`, token).pipe(
      tap(() => this.invalidateListCache())
    );
  }

  invalidateListCache(): void {
    this.listCache.clear();
  }
}
