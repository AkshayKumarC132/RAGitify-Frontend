import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { LoginRequest } from '../../../shared/models/user.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm: FormGroup;
  showRegister = false;
  errorMessage = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      identifier: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      const { identifier, password } = this.loginForm.value;
      const normalizedIdentifier = (identifier || '').trim();
      const credentials: LoginRequest = {
        password
      };

      if (normalizedIdentifier) {
        credentials.username = normalizedIdentifier;
        if (this.isEmail(normalizedIdentifier)) {
          credentials.email = normalizedIdentifier;
        }
      }

      this.authService.login(credentials).subscribe({
        next: (response) => {
          this.authService.setAuth(response.token, response.user);
          this.router.navigate(['/home']);
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

  private isEmail(value: string): boolean {
    return /\S+@\S+\.\S+/.test(value);
  }
}

