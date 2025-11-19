import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import { ApiService } from './api.service';
import { User, LoginRequest, RegisterRequest, AuthResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'current_user';
  
  private currentUserSubject = new BehaviorSubject<User | null>(this.getStoredUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/login/', credentials);
  }

  register(data: RegisterRequest): Observable<User> {
    return this.api.post<User>('/register/', data);
  }

  logout(token: string): Observable<any> {
    return this.api.post(`/logout/${token}/`, {});
  }

  verifyToken(token: string): Observable<any> {
    return this.api.get(`/protected/${token}/`);
  }

  setAuth(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  }

  clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
  }

  forceLogout(): void {
    this.clearAuth();
    this.router.navigate(['/auth/login']);
  }

  ensureValidSession(): void {
    const token = this.getToken();

    if (!token) {
      return;
    }

    this.verifyToken(token)
      .pipe(
        take(1),
        catchError(() => {
          this.forceLogout();
          return of(null);
        })
      )
      .subscribe();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

