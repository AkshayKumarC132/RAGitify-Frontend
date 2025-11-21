import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';

@Component({
  selector: 'app-workspace-layout',
  templateUrl: './workspace-layout.component.html',
  styleUrls: ['./workspace-layout.component.scss']
})
export class WorkspaceLayoutComponent {
  activeSection: 'models' | 'knowledge' | 'prompts' = 'knowledge';
  sidebarCollapsed = false;
  hoveringExpandControl = false;
  private brandExpandInteraction = false;
  private toggleExpandInteraction = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  setActiveSection(section: 'models' | 'knowledge' | 'prompts'): void {
    this.activeSection = section;
  }

  startNewChat(): void {
    this.router.navigate(['/home']);
  }

  toggleSidebar(forceState?: boolean, event?: MouseEvent): void {
    event?.stopPropagation();
    const nextState = typeof forceState === 'boolean' ? forceState : !this.sidebarCollapsed;
    if (nextState === this.sidebarCollapsed) {
      return;
    }
    this.sidebarCollapsed = nextState;
    if (!nextState) {
      this.resetExpandControlState();
    }
  }

  handleBrandExpandInteraction(active: boolean): void {
    this.brandExpandInteraction = active;
    this.updateExpandControlState();
  }

  handleToggleExpandInteraction(active: boolean): void {
    this.toggleExpandInteraction = active;
    this.updateExpandControlState();
  }

  private updateExpandControlState(): void {
    if (!this.sidebarCollapsed) {
      this.resetExpandControlState();
      return;
    }
    this.hoveringExpandControl = this.brandExpandInteraction || this.toggleExpandInteraction;
  }

  private resetExpandControlState(): void {
    this.brandExpandInteraction = false;
    this.toggleExpandInteraction = false;
    this.hoveringExpandControl = false;
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

