import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { RegisterRequest } from '../../../shared/models/user.model';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  @Output() backToLogin = new EventEmitter<void>();

  registerForm: FormGroup;
  errorMessage = '';
  loading = false;
  currentStep = 1; // Step 1: Basic Info, Step 2: LLM Setup
  showPassword = false;
  passwordStrength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';

  // Tenant selection
  tenants: { id: number; name: string }[] = [];
  filteredTenants: { id: number; name: string }[] = [];
  loadingTenants = false;
  showTenantDropdown = false;
  isNewTenant = false;

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
      collection_name: ['', [Validators.required]],
      llm_provider: ['', [Validators.required]],
      language: ['']
    });
  }

  ngOnInit(): void {
    this.loadTenants();
    // Subscribe to password changes to calculate strength
    this.registerForm.get('password')?.valueChanges.subscribe(() => {
      this.onPasswordChange();
    });
  }

  loadTenants(): void {
    this.loadingTenants = true;
    this.authService.getTenants().subscribe({
      next: (tenants) => {
        this.tenants = tenants;
        this.filteredTenants = tenants;
        this.loadingTenants = false;
      },
      error: () => {
        this.loadingTenants = false;
        // Silently fail - user can still create a new tenant
      }
    });
  }

  onTenantInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toLowerCase();
    this.filteredTenants = this.tenants.filter(t =>
      t.name.toLowerCase().includes(value)
    );
    this.showTenantDropdown = true;

    // Check if this is a new tenant (not in the list)
    this.isNewTenant = value.trim() !== '' &&
      !this.tenants.some(t => t.name.toLowerCase() === value);
  }

  selectTenant(tenant: { id: number; name: string }): void {
    this.registerForm.get('tenant_name')?.setValue(tenant.name);
    this.showTenantDropdown = false;
    this.isNewTenant = false;
  }

  onTenantFocus(): void {
    this.showTenantDropdown = true;
    this.filteredTenants = this.tenants;
  }

  onTenantBlur(): void {
    // Delay to allow click event on dropdown items
    setTimeout(() => {
      this.showTenantDropdown = false;
    }, 200);
  }

  nextStep(): void {
    // Validate Step 1 fields before proceeding
    const step1Controls = ['email', 'password', 'first_name', 'last_name', 'tenant_name'];
    let isValid = true;

    step1Controls.forEach(controlName => {
      const control = this.registerForm.get(controlName);
      if (control) {
        control.markAsTouched();
        if (control.invalid) {
          isValid = false;
        }
      }
    });

    if (isValid) {
      this.errorMessage = '';
      this.currentStep = 2;
    }
  }

  prevStep(): void {
    this.currentStep = 1;
    this.errorMessage = '';
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

  onPasswordChange(): void {
    const password = this.registerForm.get('password')?.value || '';
    this.passwordStrength = this.calculatePasswordStrength(password);
  }

  calculatePasswordStrength(password: string): 'weak' | 'fair' | 'good' | 'strong' {
    if (!password || password.length === 0) {
      return 'weak';
    }

    let strength = 0;

    // Length checks
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;

    // Character variety checks
    if (/[a-z]/.test(password)) strength += 1; // lowercase
    if (/[A-Z]/.test(password)) strength += 1; // uppercase
    if (/[0-9]/.test(password)) strength += 1; // numbers
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1; // special characters

    // Determine strength level
    if (strength <= 2) return 'weak';
    if (strength === 3) return 'fair';
    if (strength === 4) return 'good';
    return 'strong';
  }

  getStrengthPercentage(): number {
    switch (this.passwordStrength) {
      case 'weak': return 25;
      case 'fair': return 50;
      case 'good': return 75;
      case 'strong': return 100;
      default: return 0;
    }
  }

  getStrengthLabel(): string {
    switch (this.passwordStrength) {
      case 'weak': return 'Weak';
      case 'fair': return 'Fair';
      case 'good': return 'Good';
      case 'strong': return 'Strong';
      default: return '';
    }
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
