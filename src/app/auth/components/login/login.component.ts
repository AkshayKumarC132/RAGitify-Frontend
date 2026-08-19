import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { OpenAIKeyService } from '../../../shared/services/openai-key.service';
import { ToastService } from '../../../shared/services/toast.service';
import { OAuthService, OAuthProvider } from '../../../shared/services/oauth.service';
import { LoginRequest } from '../../../shared/models/user.model';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  showRegister = false;
  errorMessage = '';
  loading = false;
  showPassword = false;

  oauthSubmitting: OAuthProvider | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private openAIKeyService: OpenAIKeyService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    private oauthService: OAuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    // /auth/register resolves to this component with data.mode = 'register' —
    // the sign-up form is a pane inside this card, not a standalone screen.
    // ?mode=register is honoured too so the tab can be deep-linked directly.
    const wantsRegister = this.route.snapshot.data['mode'] === 'register'
      || this.route.snapshot.queryParamMap.get('mode') === 'register';
    if (wantsRegister) {
      this.setAuthMode(true);
    }

    if (this.authService.isAuthenticated()) {
      const status = this.authService.getCurrentStatus();
      if (status && this.authService.isLlmReady(status)) {
        this.router.navigate(['/home']);
      } else {
        // Fallback to home if status is not fully ready but user is authenticated,
        // or let the guards handle specific redirects if needed.
        this.router.navigate(['/home']);
      }
    }
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      const { email, password } = this.loginForm.value;
      const credentials: LoginRequest = {
        email: (email || '').trim(),
        password
      };

      this.authService.login(credentials).pipe(
        switchMap(response => this.authService.initializeSession(response))
      ).subscribe({
        next: (status) => {
          this.loading = false;
          // Cache the active model immediately after session initialization
          this.openAIKeyService.fetchAndCacheActiveModel();

          if (this.authService.isLlmReady(status)) {
            this.router.navigate(['/home']);
            return;
          }
          this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.error?.error || 'Login failed. Please check your credentials.';
        }
      });
    }
  }

  toggleRegister(): void {
    this.setAuthMode(!this.showRegister);
  }

  setAuthMode(showRegister: boolean): void {
    this.showRegister = showRegister;
    this.errorMessage = '';
  }

  /**
   * Kick off OAuth sign-in. Asks the backend to mint an authorize_url, stores
   * the state for the callback to verify, and redirects the browser to the
   * provider. If the provider isn't configured server-side we surface a clear
   * "not configured" message instead of a generic error.
   *
   * We pass `redirect_uri` derived from the current browser origin so that
   * local dev and production both work without having to coordinate the
   * backend's FRONTEND_BASE_URL with the browser's actual URL. The exact
   * value sent here is the one Google / Microsoft / GitHub validate against
   * their allow-list, so it must match an entry in the provider's console.
   */
  signInWithOAuth(provider: OAuthProvider): void {
    if (this.oauthSubmitting) {
      return;
    }
    this.oauthSubmitting = provider;
    this.errorMessage = '';

    const redirectUri = `${window.location.origin}/auth/oauth-callback`;
    this.oauthService.start(provider, redirectUri).subscribe({
      next: (res) => {
        this.oauthService.rememberPending(provider, res.state);
        // Full-page navigation — the provider hosts the actual sign-in screen.
        window.location.href = res.authorize_url;
      },
      error: (err) => {
        this.oauthSubmitting = null;
        const status = err?.status;
        const detail = err?.error?.detail || err?.error?.error;
        const code = err?.error?.code;

        if (status === 503 || code === 'OAUTH_NOT_CONFIGURED' || code === 'OAUTH_PROVIDER_UNKNOWN') {
          const label = this.providerLabel(provider);
          this.errorMessage = `${label} sign-in isn't configured on this server yet.`;
          this.toast.info(
            `${label} sign-in unavailable`,
            'The administrator needs to add OAuth credentials for this provider.'
          );
          return;
        }

        this.errorMessage = detail || 'Could not start the sign-in. Please try again.';
        this.toast.error('Sign-in failed', code ? `${this.errorMessage} (${code})` : this.errorMessage);
      }
    });
  }

  private providerLabel(p: OAuthProvider): string {
    return p === 'microsoft' ? 'Microsoft' : p.charAt(0).toUpperCase() + p.slice(1);
  }

}
