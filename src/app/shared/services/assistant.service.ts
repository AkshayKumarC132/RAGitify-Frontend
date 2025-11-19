import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Assistant, AssistantCreateRequest } from '../models/assistant.model';

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
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

  create(data: AssistantCreateRequest): Observable<Assistant> {
    const token = this.getToken();
    return this.api.post<Assistant>(`/assistant/${token}/`, data, token);
  }

  list(): Observable<Assistant[]> {
    const token = this.getToken();
    return this.api.get<Assistant[]>(`/assistant/${token}/list/`, token);
  }

  getById(id: string): Observable<Assistant> {
    const token = this.getToken();
    return this.api.get<Assistant>(`/assistant/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<AssistantCreateRequest>): Observable<Assistant> {
    const token = this.getToken();
    return this.api.put<Assistant>(`/assistant/${token}/${id}/`, data, token);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/assistant/${token}/${id}/`, token);
  }
}

