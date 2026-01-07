import { Injectable } from '@angular/core';
import { Observable, interval, of } from 'rxjs';
import { switchMap, takeWhile, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ResponseRecord, ResponseCreateRequest } from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class ResponseService {
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

  create(data: ResponseCreateRequest): Observable<ResponseRecord> {
    const token = this.getToken();
    return this.api.post<ResponseRecord>(`/response/chat/${token}/`, data, token);
  }

  getById(id: string): Observable<ResponseRecord> {
    const token = this.getToken();
    return this.api.get<ResponseRecord>(`/response/${token}/${id}/`, token);
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
      switchMap(() => this.getById(responseId)),
      takeWhile(
        (response) => response.status === 'in_progress',
        true // inclusive - emit the last value even if it doesn't match
      ),
      catchError((error) => {
        console.error('Error polling response status:', error);
        return of(null as any);
      })
    );
  }
}

