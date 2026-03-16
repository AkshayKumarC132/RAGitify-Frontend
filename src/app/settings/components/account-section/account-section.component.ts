import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { AuthService } from '../../../shared/services/auth.service';
import { User, UserStatus } from '../../../shared/models/user.model';

@Component({
  selector: 'app-account-section',
  templateUrl: './account-section.component.html',
  styleUrls: ['./account-section.component.scss']
})
export class AccountSectionComponent implements OnInit {
  currentUser: User | null = null;
  status: UserStatus | null = null;
  accountForm: FormGroup;
  passwordForm: FormGroup;
  profileLoading = false;
  passwordLoading = false;
  profileMessage = '';
  passwordMessage = '';
  profileMessageType: 'success' | 'error' = 'success';
  passwordMessageType: 'success' | 'error' = 'success';
  editingProfile = false;
  editingPassword = false;

  constructor(
    private authService: AuthService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.accountForm = this.fb.group({
      first_name: [''],
      last_name: [''],
      email: [{ value: '', disabled: true }]
    });

    this.passwordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordsMatchValidator });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.accountForm.patchValue({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || ''
        });
      }
    });

    this.loadStatus();
  }

  loadStatus(): void {
    this.authService.refreshUserStatus().subscribe(status => {
      this.status = status;
    });
  }

  saveAccount(): void {
    if (!this.currentUser || this.accountForm.invalid) {
      return;
    }

    this.profileLoading = true;
    this.profileMessage = '';

    this.authService.updateUserProfile(this.currentUser.id, {
      first_name: this.accountForm.get('first_name')?.value || '',
      last_name: this.accountForm.get('last_name')?.value || ''
    }).subscribe({
      next: (user) => {
        this.currentUser = user;
        this.profileLoading = false;
        this.profileMessage = 'Profile updated successfully';
        this.profileMessageType = 'success';
        this.editingProfile = false;
        this.clearMessageLater('profile');
      },
      error: (error) => {
        this.profileLoading = false;
        this.profileMessage = error?.error?.detail || error?.error?.error || 'Failed to update profile';
        this.profileMessageType = 'error';
      }
    });
  }

  async savePassword(): Promise<void> {
    if (!this.currentUser || this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const confirm = await Swal.fire({
      title: 'Update password?',
      text: 'Updating your password can log you out from this session. Continue?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, update',
      cancelButtonText: 'No'
    });

    if (!confirm.isConfirmed) {
      return;
    }

    this.passwordLoading = true;
    this.passwordMessage = '';

    this.authService.updateUserPassword(this.currentUser.id, {
      password: this.passwordForm.get('password')?.value
    }).subscribe({
      next: () => {
        this.passwordLoading = false;
        this.passwordForm.reset();
        void this.logoutAfterPasswordChange();
      },
      error: (error) => {
        this.passwordLoading = false;
        this.passwordMessage = error?.error?.detail || error?.error?.error || 'Failed to update password';
        this.passwordMessageType = 'error';
      }
    });
  }

  startProfileEdit(): void {
    this.editingProfile = true;
    this.profileMessage = '';
  }

  cancelProfileEdit(): void {
    this.editingProfile = false;
    this.profileMessage = '';
    if (this.currentUser) {
      this.accountForm.patchValue({
        first_name: this.currentUser.first_name || '',
        last_name: this.currentUser.last_name || '',
        email: this.currentUser.email || ''
      });
    }
  }

  startPasswordEdit(): void {
    this.editingPassword = true;
    this.passwordMessage = '';
  }

  cancelPasswordEdit(): void {
    this.editingPassword = false;
    this.passwordMessage = '';
    this.passwordForm.reset();
  }

  get providerDisplay(): string {
    const provider = this.status?.selected_llm_provider || (this.status as any)?.active_provider;
    return provider || 'Not configured';
  }

  get fullNameDisplay(): string {
    const fullName = `${this.currentUser?.first_name || ''} ${this.currentUser?.last_name || ''}`.trim();
    return fullName || this.currentUser?.username || 'Workspace User';
  }

  get initialsDisplay(): string {
    const first = this.currentUser?.first_name?.[0] || this.currentUser?.username?.[0] || '';
    const last = this.currentUser?.last_name?.[0] || '';
    return `${first}${last}`.trim().toUpperCase() || '?';
  }

  get tenantDisplay(): string {
    const tenantValue = this.currentUser?.tenant;
    return typeof tenantValue !== 'undefined' && tenantValue !== null ? `Tenant #${tenantValue}` : 'Not available';
  }

  get collectionDisplay(): string {
    if (this.status?.active_collection?.name) {
      return this.status.active_collection.name;
    }
    if (this.status?.active_collection?.id) {
      return this.status.active_collection.id;
    }
    return 'Not created';
  }

  get readyDisplay(): string {
    return this.status?.ready ? 'Yes' : 'No';
  }

  get collectionIdDisplay(): string {
    return this.status?.active_collection?.id || 'Not available';
  }

  get qdrantCollectionDisplay(): string {
    return this.status?.active_collection?.qdrant_collection_name || 'Not available';
  }

  get collectionDimensionDisplay(): string {
    const dimension = this.status?.active_collection?.embedding_dimension;
    return typeof dimension === 'number' ? `${dimension}` : 'Not available';
  }

  get llmConfiguredDisplay(): string {
    return this.status?.llm_configured ? 'Configured' : 'Not configured';
  }

  private passwordsMatchValidator(group: FormGroup): { passwordMismatch: true } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (!password || !confirmPassword) {
      return null;
    }
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private clearMessageLater(type: 'profile' | 'password'): void {
    setTimeout(() => {
      if (type === 'profile') {
        this.profileMessage = '';
        return;
      }
      this.passwordMessage = '';
    }, 3000);
  }

  private async logoutAfterPasswordChange(): Promise<void> {
    const token = this.authService.getToken();
    const finalizeLogout = async (): Promise<void> => {
      this.authService.clearAuth();
      localStorage.clear();
      await Swal.fire({
        title: 'Password updated',
        text: 'Please log in again to continue.',
        icon: 'success',
        confirmButtonText: 'Login Again',
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      await this.router.navigate(['/auth/login']);
    };

    if (token) {
      this.authService.logout(token).subscribe({
        next: () => {
          void finalizeLogout();
        },
        error: () => {
          void finalizeLogout();
        }
      });
      return;
    }

    await finalizeLogout();
  }
}
