import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private toast: ToastService
    ) {
        this.form = this.fb.group({
            email: ['', [Validators.required, Validators.email]]
        });
    }

    onSubmit(): void {
        if (this.form.invalid || this.submitting) {
            return;
        }
        this.submitting = true;
        // Backend endpoint not wired up yet — we surface a friendly placeholder so
        // the UX is complete and the link in the login screen no longer goes nowhere.
        setTimeout(() => {
            this.submitting = false;
            this.submitted = true;
            this.toast.info('Reset link sent', 'If an account exists for this email, instructions are on the way.');
        }, 700);
    }

    backToLogin(): void {
        this.router.navigate(['/auth/login']);
    }
}
