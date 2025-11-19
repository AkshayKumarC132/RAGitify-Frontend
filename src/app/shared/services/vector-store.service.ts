import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { VectorStore, VectorStoreCreateRequest } from '../models/vector-store.model';

@Injectable({
  providedIn: 'root'
})
export class VectorStoreService {
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

  create(data: VectorStoreCreateRequest): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.post<VectorStore>(`/vector-store/${token}/`, data, token);
  }

  list(): Observable<VectorStore[]> {
    const token = this.getToken();
    return this.api.get<VectorStore[]>(`/vector-store/${token}/list/`, token);
  }

  getById(id: string): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.get<VectorStore>(`/vector-store/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<VectorStoreCreateRequest>): Observable<VectorStore> {
    const token = this.getToken();
    return this.api.put<VectorStore>(`/vector-store/${token}/${id}/`, data, token);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/vector-store/${token}/${id}/`, token);
  }
}

