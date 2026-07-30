import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ThemeService, ThemePreference } from '../../services/theme.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeToggleComponent {
  /** Compact icon-only variant (for the top bar). */
  @Input() compact = false;

  preference$: Observable<ThemePreference>;
  theme$: Observable<'light' | 'dark'>;
  menuOpen = false;

  constructor(private themeService: ThemeService) {
    this.preference$ = this.themeService.preference$;
    this.theme$ = this.themeService.theme$;
  }

  toggleMenu(event?: MouseEvent): void {
    event?.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  select(preference: ThemePreference): void {
    this.themeService.setPreference(preference);
    this.menuOpen = false;
  }

  /** Legacy fast-toggle behaviour kept for callers that still rely on it. */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }


}
