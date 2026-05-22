import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
    selector: 'app-forgot-password',
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordComponent {
    form: FormGroup;
    submitting = false;
    submitted = false;
    /** Set when the server reports a configuration / delivery failure. */
    serverError: string | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private toast: ToastService,
        private auth: AuthService,
        private cdr: ChangeDetectorRef
    ) {
        this.form = this.fb.group({
            email: ['', [Validators.required, Validators.email]]
        });
    }

    onSubmit(): void {
        if (this.form.invalid || this.submitting) {
            return;
        }
        const email = (this.form.get('email')?.value || '').trim();
        this.submitting = true;
        this.serverError = null;
        this.cdr.markForCheck();
        this.auth.requestPasswordReset(email).subscribe({
            next: () => {
                this.submitting = false;
                this.submitted = true;
                this.toast.info('Reset link sent', 'If an account exists for this email, instructions are on the way.');
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.submitting = false;
                this.handleServerError(err);
                this.cdr.markForCheck();
            }
        });
    }

    /**
     * Surface real server problems (email backend missing, SMTP unreachable, etc.)
     * rather than pretending success. The backend returns 503/500 with a
     * { error, detail, code } payload — we show the detail in-form and a toast.
     */
    private handleServerError(err: any): void {
        const status = err?.status;
        const detail = err?.error?.detail || err?.error?.error;
        const code = err?.error?.code;

        // True server-side issues: show explicit error so the user/admin can act.
        if (status === 503 || status === 500) {
            const title = status === 503
                ? 'Email service unavailable'
                : 'Could not send reset email';
            const message = detail
                || 'The server failed to deliver the reset email. Please try again later or contact support.';
            this.serverError = message;
            this.toast.error(title, code ? `${message} (${code})` : message, 9000);
            return;
        }

        // 4xx (rare here, e.g. validation): show but don't reveal account existence.
        if (status >= 400 && status < 500) {
            const msg = detail || 'Please check the email address and try again.';
            this.serverError = msg;
            this.toast.warning('Request rejected', msg);
            return;
        }

        // Network / unknown: don't reveal anything, but tell the user something is off.
        this.serverError = 'We could not reach the server. Check your connection and try again.';
        this.toast.error('Network error', this.serverError);
    }

    backToLogin(): void {
        this.router.navigate(['/auth/login']);
    }
}
