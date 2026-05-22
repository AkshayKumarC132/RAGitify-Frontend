import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
    selector: 'app-reset-password',
    templateUrl: './reset-password.component.html',
    styleUrls: ['../forgot-password/forgot-password.component.scss', './reset-password.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent implements OnInit {
    form: FormGroup;
    submitting = false;
    submitted = false;
    showPassword = false;
    token = '';
    errorMessage = '';

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private auth: AuthService,
        private toast: ToastService,
        private cdr: ChangeDetectorRef
    ) {
        this.form = this.fb.group(
            {
                password: ['', [Validators.required, Validators.minLength(8)]],
                confirm: ['', [Validators.required]]
            },
            { validators: this.passwordsMatch }
        );
    }

    ngOnInit(): void {
        this.token = (this.route.snapshot.queryParamMap.get('token') || '').trim();
        if (!this.token) {
            this.errorMessage = 'This reset link is missing its token. Please request a new one.';
        }
    }

    private passwordsMatch(group: AbstractControl): ValidationErrors | null {
        const pwd = group.get('password')?.value;
        const confirm = group.get('confirm')?.value;
        return pwd && confirm && pwd !== confirm ? { mismatch: true } : null;
    }

    get passwordChecks(): { label: string; ok: boolean }[] {
        const pwd = this.form.get('password')?.value || '';
        return [
            { label: '8+ characters', ok: pwd.length >= 8 },
            { label: 'Uppercase letter', ok: /[A-Z]/.test(pwd) },
            { label: 'Lowercase letter', ok: /[a-z]/.test(pwd) },
            { label: 'Number', ok: /[0-9]/.test(pwd) },
            { label: 'Symbol', ok: /[^a-zA-Z0-9]/.test(pwd) }
        ];
    }

    onSubmit(): void {
        if (this.form.invalid || this.submitting || !this.token) {
            return;
        }
        const password = this.form.get('password')?.value;
        this.submitting = true;
        this.errorMessage = '';
        this.cdr.markForCheck();

        this.auth.confirmPasswordReset(this.token, password).subscribe({
            next: () => {
                this.submitting = false;
                this.submitted = true;
                this.toast.success('Password updated', 'You can now sign in with your new password.');
                this.cdr.markForCheck();
                setTimeout(() => this.router.navigate(['/auth/login']), 1500);
            },
            error: (err) => {
                this.submitting = false;
                this.errorMessage = err?.error?.error || 'Could not reset password. The link may be invalid or expired.';
                this.cdr.markForCheck();
            }
        });
    }

    backToLogin(): void {
        this.router.navigate(['/auth/login']);
    }
}
