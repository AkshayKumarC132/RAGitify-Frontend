import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { RegisterRequest } from '../../../shared/models/user.model';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  @Output() backToLogin = new EventEmitter<void>();
  
  registerForm: FormGroup;
  errorMessage = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      first_name: [''],
      last_name: [''],
      tenant_name: ['', [Validators.required]],
      collection_name: [''],
      llm_provider: [''],
      language: ['']
    });
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      
      const formValue = this.registerForm.value;
      const registerData: RegisterRequest = {
        email: formValue.email,
        password: formValue.password,
        first_name: formValue.first_name || undefined,
        last_name: formValue.last_name || undefined,
        tenant_name: formValue.tenant_name,
        collection_name: formValue.collection_name || undefined,
        llm_provider: formValue.llm_provider || undefined,
        language: formValue.language || undefined
      };

      if (registerData.llm_provider && !registerData.collection_name) {
        this.loading = false;
        this.errorMessage = 'Collection name is required when selecting an LLM provider.';
        return;
      }

      this.authService.register(registerData).subscribe({
        next: () => {
          // Registration endpoint does not return a token, so immediately log the user in
          this.authService.login({
            email: registerData.email,
            password: registerData.password
          }).subscribe({
            next: (loginResponse) => {
              this.authService.initializeSession(loginResponse).subscribe({
                next: (status) => {
                  this.loading = false;
                  if (this.authService.isLlmReady(status)) {
                    this.router.navigate(['/home']);
                    return;
                  }
                  this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
                },
                error: (statusError) => {
                  this.loading = false;
                  this.errorMessage = this.extractErrorMessage(statusError, 'Registration succeeded, but setup is incomplete. Please continue onboarding.');
                  this.router.navigate(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
                }
              });
            },
            error: (loginError) => {
              this.loading = false;
              this.errorMessage = this.extractErrorMessage(loginError, 'Registration succeeded, but automatic login failed. Please try signing in manually.');
            }
          });
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = this.extractErrorMessage(error, 'Registration failed. Please try again.');
        }
      });
    }
  }

  goBack(): void {
    this.backToLogin.emit();
  }

  private extractErrorMessage(error: any, fallback: string): string {
    if (error?.error) {
      const payload = error.error;
      if (typeof payload === 'string') {
        return payload;
      }
      if (payload.error && typeof payload.error === 'string') {
        return payload.error;
      }
      if (typeof payload === 'object') {
        const firstKey = Object.keys(payload)[0];
        if (firstKey) {
          const value = payload[firstKey];
          if (Array.isArray(value)) {
            return value.join(', ');
          }
          if (typeof value === 'string') {
            return value;
          }
        }
      }
    }
    return fallback;
  }

}
