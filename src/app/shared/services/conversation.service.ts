import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Conversation, ConversationCreateRequest, ConversationMessage } from '../models/conversation.model';

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
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

  create(data: ConversationCreateRequest): Observable<Conversation> {
    const token = this.getToken();
    return this.api.post<Conversation>(`/conversation/generate/${token}/`, data, token);
  }

  list(): Observable<Conversation[]> {
    const token = this.getToken();
    return this.api.get<Conversation[]>(`/conversation/${token}/list/`, token);
  }

  getById(id: string): Observable<Conversation> {
    const token = this.getToken();
    return this.api.get<Conversation>(`/conversation/${token}/${id}/`, token);
  }

  update(id: string, data: Partial<ConversationCreateRequest>): Observable<Conversation> {
    const token = this.getToken();
    return this.api.put<Conversation>(`/conversation/${token}/${id}/`, data, token);
  }

  patch(id: string, data: Partial<ConversationCreateRequest>): Observable<Conversation> {
    const token = this.getToken();
    return this.api.patch<Conversation>(`/conversation/${token}/${id}/`, data, token);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/conversation/${token}/${id}/`, token);
  }

  getMessages(conversationId: string): Observable<ConversationMessage[]> {
    const token = this.getToken();
    return this.api.get<ConversationMessage[]>(`/conversation/${conversationId}/items/${token}/`, token);
  }

  getDataGrid(conversationId: string, messageId: string | number): Observable<{ id: number, message: number, data: Record<string, any>[], row_count: number, sql_query?: string, created_at: string }> {
    const token = this.getToken();
    return this.api.get<{ id: number, message: number, data: Record<string, any>[], row_count: number, sql_query?: string, created_at: string }>(`/conversation/${conversationId}/messages/${messageId}/data-grid/${token}/`, token);
  }
}
