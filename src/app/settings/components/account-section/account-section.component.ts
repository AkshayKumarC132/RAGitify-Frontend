import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-account-section',
  templateUrl: './account-section.component.html',
  styleUrls: ['./account-section.component.scss']
})
export class AccountSectionComponent implements OnInit {
  currentUser: User | null = null;
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
      username: ['']
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
      ...this.accountForm.getRawValue()
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
}

