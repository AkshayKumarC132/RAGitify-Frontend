import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ThemeMode = 'light' | 'dark';
export type UIStyle = 'default' | 'glass' | 'neumorphic';

const STORAGE_KEY = 'ragitify-theme';
const STYLE_STORAGE_KEY = 'ragitify-ui-style';
const DEFAULT_THEME: ThemeMode = 'light';
const DEFAULT_STYLE: UIStyle = 'default';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeSubject = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
  private readonly styleSubject = new BehaviorSubject<UIStyle>(this.getInitialStyle());

  readonly theme$ = this.themeSubject.asObservable();
  readonly style$ = this.styleSubject.asObservable();

  constructor() {
    this.applyTheme(this.themeSubject.value);
    this.applyStyle(this.styleSubject.value);

    // Listen for changes in other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        const newTheme = event.newValue as ThemeMode;
        if (newTheme && (newTheme === 'light' || newTheme === 'dark')) {
          this.themeSubject.next(newTheme);
          this.applyTheme(newTheme);
        }
      } else if (event.key === STYLE_STORAGE_KEY) {
        const newStyle = event.newValue as UIStyle;
        if (newStyle && (newStyle === 'default' || newStyle === 'glass' || newStyle === 'neumorphic')) {
          this.styleSubject.next(newStyle);
          this.applyStyle(newStyle);
        }
      }
    });
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

  setStyle(style: UIStyle): void {
    if (this.styleSubject.value === style) {
      return;
    }
    this.styleSubject.next(style);
    localStorage.setItem(STYLE_STORAGE_KEY, style);
    this.applyStyle(style);
  }

  private getInitialTheme(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return DEFAULT_THEME;
  }

  private getInitialStyle(): UIStyle {
    const stored = localStorage.getItem(STYLE_STORAGE_KEY) as UIStyle | null;
    if (stored === 'default' || stored === 'glass' || stored === 'neumorphic') {
      return stored;
    }
    return DEFAULT_STYLE;
  }

  private applyTheme(theme: ThemeMode): void {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
  }

  private applyStyle(style: UIStyle): void {
    document.body.classList.remove('style-default', 'style-glass', 'style-neumorphic');
    document.body.classList.add(`style-${style}`);
  }
}
