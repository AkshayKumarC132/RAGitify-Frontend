import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpEvent } from '@angular/common/http';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Document, DocumentIngestRequest, DocumentStatus } from '../models/document.model';
import { HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  constructor(
    private api: ApiService,
    private auth: AuthService
  ) {}

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
    
    return this.api.postFormData<Document>(`/document/${token}/ingest/`, formData, token);
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

    return this.api.postFormDataWithProgress<Document>(`/document/${token}/ingest/`, formData, token);
  }

  list(vectorStoreId?: string): Observable<Document[]> {
    const token = this.getToken();
    let params = new HttpParams();
    if (vectorStoreId) {
      params = params.set('vector_store_id', vectorStoreId);
    }
    return this.api.get<Document[]>(`/document/${token}/list/`, token, params);
  }

  getById(id: string): Observable<Document> {
    const token = this.getToken();
    return this.api.get<Document>(`/document/${token}/${id}/`, token);
  }

  getStatus(documentId: string): Observable<DocumentStatus> {
    const token = this.getToken();
    return this.api.get<DocumentStatus>(`/document/${token}/${documentId}/status/`, token);
  }

  update(id: string, data: Partial<Document>): Observable<Document> {
    const token = this.getToken();
    return this.api.put<Document>(`/document/${token}/${id}/`, data, token);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/document/${token}/${id}/`, token);
  }
}
