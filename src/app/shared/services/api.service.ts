import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  private getHeaders(token?: string): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }

    return headers;
  }

  get<T>(endpoint: string, token?: string, params?: HttpParams, context?: HttpContext): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(token),
      params,
      context
    });
  }

  post<T>(endpoint: string, data: any, token?: string, context?: HttpContext): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token),
      context
    });
  }

  put<T>(endpoint: string, data: any, token?: string, context?: HttpContext): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token),
      context
    });
  }

  patch<T>(endpoint: string, data: any, token?: string, context?: HttpContext): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token),
      context
    });
  }

  delete<T>(endpoint: string, token?: string, context?: HttpContext): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(token),
      context
    });
  }

  deleteWithBody<T>(endpoint: string, data: any, token?: string, context?: HttpContext): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(token),
      body: data,
      context
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

  postFormDataWithProgress<T>(endpoint: string, formData: FormData, token?: string, context?: HttpContext): Observable<HttpEvent<T>> {
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }

    return this.http.post<T>(`${this.baseUrl}${endpoint}`, formData, {
      headers,
      observe: 'events',
      reportProgress: true,
      context: context || new HttpContext()
    });
  }
}
