import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, take, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { User, LoginRequest, RegisterRequest, AuthResponse, UserStatus, LlmSetupRequest } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'current_user';
  
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private userStatusSubject = new BehaviorSubject<UserStatus | null>(null);
  public userStatus$ = this.userStatusSubject.asObservable();

  constructor(
    private api: ApiService,
    private router: Router
  ) {
    this.restoreUserFromStorage();
  }

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
    this.syncStatusFromUser(user);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) {
      return null;
    }

    try {
      return JSON.parse(userStr);
    } catch (error) {
      console.error('[AuthService] Unable to parse stored user, clearing cache', error);
      localStorage.removeItem(this.USER_KEY);
      return null;
    }
  }

  restoreUserFromStorage(): void {
    const storedUser = this.getStoredUser();
    if (storedUser) {
      this.currentUserSubject.next(storedUser);
      this.syncStatusFromUser(storedUser);
    }
  }

  clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
    this.userStatusSubject.next(null);
  }

  forceLogout(): void {
    this.clearAuth();
    this.router.navigate(['/auth/login']);
  }

  ensureValidSession(): void {
    const token = this.getToken();

    if (!token) {
      this.currentUserSubject.next(null);
      this.userStatusSubject.next(null);
      return;
    }

    this.verifyToken(token)
      .pipe(
        take(1),
        switchMap((response) => {
          if (response === null) {
            return of(null);
          }
          return this.refreshUserStatus().pipe(
            catchError((error) => {
              this.handlePossibleSetupError(error);
              return of(null);
            })
          );
        }),
        catchError(() => {
          this.forceLogout();
          return of(null);
        })
      )
      .subscribe(() => {
        this.restoreUserFromStorage();
      });
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  isLlmReady(statusSnapshot?: UserStatus | User | null): boolean {
    const target = statusSnapshot || this.userStatusSubject.value || this.currentUserSubject.value;
    return !!target &&
      target.llm_configured === true &&
      target.active_collection_ready === true &&
      !!target.active_collection;
  }

  refreshUserStatus(): Observable<UserStatus> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token is required'));
    }
    return this.api.get<UserStatus>(`/me/status/${token}/`, token).pipe(
      tap(status => this.applyStatus(status))
    );
  }

  ensureStatus(): Observable<UserStatus | null> {
    const cached = this.userStatusSubject.value;
    if (cached) {
      return of(cached);
    }
    return this.refreshUserStatus().pipe(
      catchError(() => of(null))
    );
  }

  initializeSession(response: AuthResponse): Observable<UserStatus | null> {
    this.setAuth(response.token, response.user);
    return this.refreshUserStatus().pipe(
      catchError((error) => {
        this.handlePossibleSetupError(error);
        return of(this.userStatusSubject.value);
      })
    );
  }

  completeLlmSetup(payload: LlmSetupRequest): Observable<UserStatus> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token is required'));
    }
    return this.api.post<UserStatus>(`/llm/setup/${token}/`, payload, token).pipe(
      tap(status => this.applyStatus(status))
    );
  }

  handleSetupRequirement(payload?: any): void {
    const status = this.extractStatus(payload);
    if (status) {
      this.applyStatus(status);
    }
    if (!this.router.url.startsWith('/setup-llm')) {
      this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
    }
  }

  getCurrentStatus(): UserStatus | null {
    return this.userStatusSubject.value;
  }

  private applyStatus(status: UserStatus | null): void {
    this.userStatusSubject.next(status);
    const storedUser = this.getStoredUser();
    if (storedUser) {
      const mergedUser = { ...storedUser, ...status };
      localStorage.setItem(this.USER_KEY, JSON.stringify(mergedUser));
      this.currentUserSubject.next(mergedUser);
    }
  }

  private syncStatusFromUser(user: User | null): void {
    const status = this.extractStatus(user);
    this.userStatusSubject.next(status);
  }

  private extractStatus(source: Partial<UserStatus & User> | null | undefined): UserStatus | null {
    if (!source) {
      return null;
    }
    const hasStatusFields = typeof source.llm_configured !== 'undefined' ||
      typeof source.active_collection_ready !== 'undefined' ||
      typeof source.active_collection !== 'undefined' ||
      typeof source.selected_llm_provider !== 'undefined';
    if (!hasStatusFields) {
      return null;
    }
    return {
      llm_configured: !!source.llm_configured,
      active_collection_ready: !!source.active_collection_ready,
      active_collection: typeof source.active_collection === 'undefined' ? null : source.active_collection,
      selected_llm_provider: source.selected_llm_provider ?? null
    };
  }

  private handlePossibleSetupError(error: any): void {
    if (error?.status === 403 && error?.error?.code === 'LLM_SETUP_REQUIRED') {
      this.handleSetupRequirement(error.error);
    }
  }
}
