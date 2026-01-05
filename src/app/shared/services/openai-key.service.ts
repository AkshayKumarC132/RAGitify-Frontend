import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { OpenAIKey, OpenAIKeyCreateRequest } from '../models/openai-key.model';

@Injectable({
  providedIn: 'root'
})
export class OpenAIKeyService {
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

  create(data: OpenAIKeyCreateRequest): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.post<OpenAIKey>(`/llm-config/${token}/`, data, token);
  }

  list(): Observable<OpenAIKey[]> {
    const token = this.getToken();
    return this.api.get<OpenAIKey[]>(`/llm-config/${token}/list/`, token);
  }

  getById(id: number): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.get<OpenAIKey>(`/llm-config/${token}/${id}/`, token);
  }

  update(id: number, data: Partial<OpenAIKeyCreateRequest>): Observable<OpenAIKey> {
    const token = this.getToken();
    return this.api.put<OpenAIKey>(`/llm-config/${token}/${id}/`, data, token);
  }

  delete(id: number): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/llm-config/${token}/${id}/`, token);
  }
}

