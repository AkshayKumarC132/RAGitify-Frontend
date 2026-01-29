import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'ragitify-theme';
const DEFAULT_THEME: ThemeMode = 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeSubject = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
  readonly theme$ = this.themeSubject.asObservable();

  constructor() {
    this.applyTheme(this.themeSubject.value);
  }

  /**
   * Removes the persisted theme from storage without changing
   * the currently applied UI theme (preserves current UI state).
   */
  clearThemeCache(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Force the theme to Light Mode (and persist it).
   * Used to ensure a consistent default theme upon login.
   */
  forceLightTheme(): void {
    this.setTheme('light');
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.themeSubject.value === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  setTheme(theme: ThemeMode): void {
    if (this.themeSubject.value === theme) {
      return;
    }
    this.themeSubject.next(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.applyTheme(theme);
  }

  private getInitialTheme(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return DEFAULT_THEME;
  }

  private applyTheme(theme: ThemeMode): void {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
  }
}
