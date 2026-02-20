import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { User, LoginRequest, RegisterRequest, AuthResponse, UserStatus, LlmSetupRequest, SelectedLLMProvider } from '../models/user.model';
import { ThemeService } from './theme.service';
import { UserStateService } from './user-state.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'current_user';
  private readonly ACTIVE_MODEL_KEY = 'active_llm_model';

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private userStatusSubject = new BehaviorSubject<UserStatus | null>(null);
  public userStatus$ = this.userStatusSubject.asObservable();

  constructor(
    private api: ApiService,
    private router: Router,
    private themeService: ThemeService,
    private userStateService: UserStateService
  ) {
    this.restoreUserFromStorage();
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/login/', credentials);
  }

  register(data: RegisterRequest): Observable<User> {
    return this.api.post<User>('/register/', data);
  }

  getTenants(): Observable<{ id: number; name: string }[]> {
    return this.api.get<{ id: number; name: string }[]>('/tenant/list/');
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
    this.userStateService.setCurrentUserId(user.id);
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

  storeActiveModel(model: string): void {
    if (model) {
      localStorage.setItem(this.ACTIVE_MODEL_KEY, model);
    }
  }

  getActiveModel(): string | null {
    return localStorage.getItem(this.ACTIVE_MODEL_KEY);
  }

  clearActiveModel(): void {
    localStorage.removeItem(this.ACTIVE_MODEL_KEY);
  }

  restoreUserFromStorage(): void {
    const storedUser = this.getStoredUser();
    if (storedUser) {
      this.currentUserSubject.next(storedUser);
      this.syncStatusFromUser(storedUser);
      this.userStateService.setCurrentUserId(storedUser.id);
    }
  }

  clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.clearActiveModel();
    this.currentUserSubject.next(null);
    this.userStatusSubject.next(null);
    // Remove persisted theme preference on logout, but keep current UI as-is.
    this.themeService.clearThemeCache();
    // Purge every user-scoped data cache.
    this.userStateService.resetAllCaches();
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
          // Session exists/valid: ensure Light Mode is the default for this login.
          this.themeService.forceLightTheme();
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
    if (!target) {
      return false;
    }

    const readyFlag = (target as any).ready;
    const llmConfigured = !!(target as any).llm_configured;
    const collectionReady = !!((target as any).active_collection_ready ?? (target as any).collection_ready);
    const activeCollection = (target as any).active_collection;

    if (readyFlag === true && llmConfigured && collectionReady && activeCollection) {
      return true;
    }

    return llmConfigured && collectionReady && !!activeCollection;
  }

  refreshUserStatus(): Observable<UserStatus> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token is required'));
    }
    return this.api.get<UserStatus>(`/me/status/${token}/`, token).pipe(
      map((status: UserStatus) => this.normalizeStatus(status) as UserStatus),
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
    // If a different user is logging in, purge stale caches first.
    const previousUserId = this.userStateService.currentUserId;
    if (previousUserId !== null && previousUserId !== response.user.id) {
      this.userStateService.resetAllCaches();
    }
    this.setAuth(response.token, response.user);
    // Always default to Light Mode upon login.
    this.themeService.forceLightTheme();
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
    return this.api.post<any>(`/llm/setup/${token}/`, payload, token).pipe(
      switchMap(response => {
        const normalized = this.normalizeStatus({
          ...response,
          llm_configured: true,
          collection_ready: true,
          active_provider: response?.active_collection?.provider ?? (payload.llm_provider === 'openai' ? 'OpenAI' : 'Ollama'),
          active_collection: response?.active_collection,
          ready: true
        });
        if (normalized) {
          this.applyStatus(normalized);
          return of(normalized);
        }
        return this.refreshUserStatus();
      })
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
    return this.normalizeStatus(source);
  }

  private handlePossibleSetupError(error: any): void {
    if (error?.status === 403 && error?.error?.code === 'LLM_SETUP_REQUIRED') {
      this.handleSetupRequirement(error.error);
    }
  }

  private normalizeStatus(source: any): UserStatus | null {
    if (!source) {
      return null;
    }

    const hasStatusFields = typeof source.llm_configured !== 'undefined' ||
      typeof source.active_collection_ready !== 'undefined' ||
      typeof source.collection_ready !== 'undefined' ||
      typeof source.active_collection !== 'undefined' ||
      typeof source.selected_llm_provider !== 'undefined' ||
      typeof source.active_provider !== 'undefined' ||
      typeof source.ready !== 'undefined';

    if (!hasStatusFields) {
      return null;
    }

    const activeProviderRaw: string | null | undefined = source.active_provider ?? source.selected_llm_provider ?? null;
    const provider: SelectedLLMProvider | null = activeProviderRaw === 'Ollama' || activeProviderRaw === 'OpenAI'
      ? activeProviderRaw
      : null;

    const collection = source.active_collection ?? null;
    const collectionReady = !!(source.active_collection_ready ?? source.collection_ready);
    const llmConfigured = !!source.llm_configured || (!!collection && collectionReady);
    const ready = source.ready ?? (llmConfigured && collectionReady && !!collection);

    return {
      llm_configured: llmConfigured,
      active_collection_ready: collectionReady,
      active_collection: collection,
      selected_llm_provider: provider,
      ready
    };
  }
}
