import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../../../shared/services/auth.service';
import { OAuthService, OAuthProvider } from '../../../shared/services/oauth.service';
import { OpenAIKeyService } from '../../../shared/services/openai-key.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
    selector: 'app-oauth-callback',
    templateUrl: './oauth-callback.component.html',
    styleUrls: ['./oauth-callback.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OAuthCallbackComponent implements OnInit {
    status: 'working' | 'error' = 'working';
    errorMessage = '';
    errorCode = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private oauth: OAuthService,
        private auth: AuthService,
        private openAIKeyService: OpenAIKeyService,
        private toast: ToastService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        const code = (params.get('code') || '').trim();
        const state = (params.get('state') || '').trim();
        const errorParam = params.get('error');

        if (errorParam) {
            // Provider denied / cancelled. errorParam is e.g. 'access_denied'.
            return this.fail(
                'Sign-in cancelled.',
                params.get('error_description') || errorParam,
                errorParam.toUpperCase()
            );
        }

        if (!code || !state) {
            return this.fail(
                'Invalid sign-in response.',
                'The provider did not return the expected authorization code.',
                'OAUTH_BAD_CALLBACK'
            );
        }

        const pending = this.oauth.consumePending();
        if (!pending || pending.state !== state) {
            return this.fail(
                'Sign-in expired.',
                'This sign-in link has expired or was opened in a different browser. Please try again.',
                'OAUTH_STATE_MISMATCH'
            );
        }

        const provider: OAuthProvider = pending.provider;
        this.oauth.complete(provider, { code, state }).pipe(
            switchMap(response => this.auth.initializeSession(response).pipe(
                switchMap(status => of({ response, status }))
            ))
        ).subscribe({
            next: ({ status }) => {
                this.openAIKeyService.fetchAndCacheActiveModel();
                this.toast.success('Signed in', `Welcome back via ${this.providerLabel(provider)}.`);
                if (this.auth.isLlmReady(status)) {
                    this.router.navigate(['/home']);
                } else {
                    this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
                }
            },
            error: (err) => {
                const detail = err?.error?.detail || err?.error?.error;
                const code = err?.error?.code || 'OAUTH_FAILED';
                this.fail(
                    'Sign-in failed.',
                    detail || 'We could not complete the sign-in. Please try again.',
                    code
                );
            }
        });
    }

    backToLogin(): void {
        this.router.navigate(['/auth/login']);
    }

    private providerLabel(p: OAuthProvider): string {
        return p === 'microsoft' ? 'Microsoft' : p.charAt(0).toUpperCase() + p.slice(1);
    }

    private fail(title: string, message: string, code: string): void {
        this.status = 'error';
        this.errorMessage = `${title} ${message}`.trim();
        this.errorCode = code;
        this.toast.error(title, code ? `${message} (${code})` : message, 9000);
        this.cdr.markForCheck();
    }
}
