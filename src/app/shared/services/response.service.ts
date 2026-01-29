import { Injectable } from '@angular/core';
import { Observable, interval, of } from 'rxjs';
import { switchMap, takeWhile, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { HttpContext } from '@angular/common/http';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';
import { ResponseRecord, ResponseCreateRequest } from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class ResponseService {
  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  getDefaultModel(): string {
    const storedUser = this.auth.getStoredUser() as any;

    // Prioritize active_provider then selected_llm_provider
    const provider = storedUser?.active_provider
      || storedUser?.selected_llm_provider
      || (typeof storedUser?.active_collection === 'object' ? storedUser?.active_collection?.provider : null)
      || null;

    if (provider === 'Ollama') {
      return 'llama3.1:latest';
    }

    // Default to gpt-4o for OpenAI or fallback
    return 'gpt-4.1';
  }

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  create(data: ResponseCreateRequest): Observable<ResponseRecord> {
    const token = this.getToken();
    const payload = data.model ? data : { ...data, model: this.getDefaultModel() };
    return this.api.post<ResponseRecord>(`/response/chat/${token}/`, payload, token);
  }

  getById(id: string, skipLoading: boolean = false): Observable<ResponseRecord> {
    const token = this.getToken();
    const context = new HttpContext().set(SKIP_LOADING, skipLoading);
    return this.api.get<ResponseRecord>(`/response/${token}/${id}/`, token, undefined, context);
  }

  delete(id: string): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/response/${token}/${id}/`, token);
  }

  cancel(responseId: string): Observable<any> {
    const token = this.getToken();
    return this.api.post<any>(`/response/${token}/${responseId}/cancel/`, {}, token);
  }

  pollResponseStatus(responseId: string): Observable<ResponseRecord> {
    return interval(2000).pipe(
      switchMap(() => this.getById(responseId, true)),
      takeWhile(
        (response) => response?.status === 'in_progress',
        true // inclusive - emit the last value even if it doesn't match
      ),
      catchError((error) => {
        console.error('Error polling response status:', error);
        return of(null as any);
      })
    );
  }
}
