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
      collection_name: ['']
    });
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      
      const formValue = this.registerForm.value;
      const registerData: RegisterRequest = {
        username: this.deriveUsername(formValue.email),
        email: formValue.email,
        password: formValue.password,
        first_name: formValue.first_name || undefined,
        last_name: formValue.last_name || undefined,
        tenant_name: formValue.tenant_name,
        collection_name: formValue.collection_name || undefined
      };

      this.authService.register(registerData).subscribe({
        next: () => {
          // Registration endpoint does not return a token, so immediately log the user in
          this.authService.login({
            email: registerData.email,
            password: registerData.password
          }).subscribe({
            next: (loginResponse) => {
              this.loading = false;
              this.authService.setAuth(loginResponse.token, loginResponse.user);
              this.router.navigate(['/home']);
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

  private deriveUsername(email: string): string {
    if (!email) {
      return 'ragitify-user';
    }
    const [local] = email.split('@');
    return local?.trim() || email;
  }
}

