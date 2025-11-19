import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DocumentAccess, DocumentAccessCreateRequest, DocumentAccessRemoveRequest } from '../models/document-access.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentAccessService {
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

  create(data: DocumentAccessCreateRequest): Observable<DocumentAccess> {
    const token = this.getToken();
    return this.api.post<DocumentAccess>(`/document-access/${token}/`, data, token);
  }

  list(): Observable<DocumentAccess[]> {
    const token = this.getToken();
    return this.api.get<DocumentAccess[]>(`/document-access/${token}/list/`, token);
  }

  getById(id: number): Observable<DocumentAccess> {
    const token = this.getToken();
    return this.api.get<DocumentAccess>(`/document-access/${token}/${id}/`, token);
  }

  update(id: number, data: Partial<DocumentAccessCreateRequest>): Observable<DocumentAccess> {
    const token = this.getToken();
    return this.api.put<DocumentAccess>(`/document-access/${token}/${id}/`, data, token);
  }

  remove(data: DocumentAccessRemoveRequest): Observable<any> {
    const token = this.getToken();
    return this.api.put(`/document-access/remove/${token}/`, data, token);
  }

  delete(id: number): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/document-access/${token}/${id}/`, token);
  }
}

