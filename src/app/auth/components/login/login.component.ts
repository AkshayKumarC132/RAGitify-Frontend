import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
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

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.authService.clearAuth();
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

}
