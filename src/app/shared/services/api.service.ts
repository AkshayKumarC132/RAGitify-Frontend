import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getHeaders(token?: string): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }
    
    return headers;
  }

  get<T>(endpoint: string, token?: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(token),
      params
    });
  }

  post<T>(endpoint: string, data: any, token?: string): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token)
    });
  }

  put<T>(endpoint: string, data: any, token?: string): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token)
    });
  }

  delete<T>(endpoint: string, token?: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(token)
    });
  }

  postFormData<T>(endpoint: string, formData: FormData, token?: string): Observable<T> {
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }
    
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, formData, {
      headers
    });
  }

  postFormDataWithProgress<T>(endpoint: string, formData: FormData, token?: string): Observable<HttpEvent<T>> {
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }

    return this.http.post<T>(`${this.baseUrl}${endpoint}`, formData, {
      headers,
      observe: 'events',
      reportProgress: true
    });
  }
}
