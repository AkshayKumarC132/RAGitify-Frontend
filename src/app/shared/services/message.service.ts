import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Message, MessageCreateRequest } from '../models/message.model';
import { HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
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

  create(data: MessageCreateRequest): Observable<Message> {
    const token = this.getToken();
    return this.api.post<Message>(`/message/${token}/`, data, token);
  }

  list(threadId?: string): Observable<Message[]> {
    const token = this.getToken();
    let params = new HttpParams();
    if (threadId) {
      params = params.set('thread_id', threadId);
    }
    return this.api.get<Message[]>(`/message/${token}/list/`, token, params);
  }

  getById(id: number): Observable<Message> {
    const token = this.getToken();
    return this.api.get<Message>(`/message/${token}/${id}/`, token);
  }

  update(id: number, data: Partial<MessageCreateRequest>): Observable<Message> {
    const token = this.getToken();
    return this.api.put<Message>(`/message/${token}/${id}/`, data, token);
  }

  delete(id: number): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/message/${token}/${id}/`, token);
  }
}

