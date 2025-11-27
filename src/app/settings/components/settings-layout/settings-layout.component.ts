import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';

type SettingsTab = 'general' | 'models' | 'account';

@Component({
  selector: 'app-settings-layout',
  templateUrl: './settings-layout.component.html',
  styleUrls: ['./settings-layout.component.scss']
})
export class SettingsLayoutComponent {
  activeTab: SettingsTab = 'general';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  goToHome(): void {
    this.router.navigate(['/home']);
  }

  setActiveTab(tab: SettingsTab): void {
    this.activeTab = tab;
  }

  logout(): void {
    const token = this.authService.getToken();
    if (token) {
      this.authService.logout(token).subscribe({
        next: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        },
        error: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        }
      });
    } else {
      this.authService.clearAuth();
      this.router.navigate(['/auth/login']);
    }
  }
}

