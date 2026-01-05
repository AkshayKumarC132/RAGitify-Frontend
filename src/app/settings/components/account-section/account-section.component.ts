import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  loading = false;
  message = '';
  messageType: 'success' | 'error' = 'success';

  constructor(
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.accountForm = this.fb.group({
      first_name: [''],
      last_name: [''],
      email: [{ value: '', disabled: true }],
      username: [{ value: '', disabled: true }]
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.accountForm.patchValue({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          username: user.username || ''
        });
      }
    });

    this.authService.ensureStatus().subscribe(status => {
      this.status = status;
    });
  }

  saveAccount(): void {
    if (!this.currentUser || this.accountForm.invalid) {
      return;
    }

    this.loading = true;
    this.message = '';

    const token = this.authService.getToken();
    const updatedUser: User = {
      ...this.currentUser,
      first_name: this.accountForm.get('first_name')?.value || '',
      last_name: this.accountForm.get('last_name')?.value || ''
    };

    if (token) {
      this.authService.setAuth(token, updatedUser);
    }

    this.currentUser = updatedUser;
    this.message = 'Account updated successfully';
    this.messageType = 'success';
    this.loading = false;

    setTimeout(() => {
      this.message = '';
    }, 3000);
  }

  get providerDisplay(): string {
    const provider = this.status?.selected_llm_provider || (this.status as any)?.active_provider;
    return provider || 'Not configured';
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
}
