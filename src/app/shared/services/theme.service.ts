import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';
export type UIStyle = 'default' | 'glass' | 'neumorphic';

const STORAGE_KEY = 'ragitify-theme';
const PREFERENCE_KEY = 'ragitify-theme-preference';
const STYLE_STORAGE_KEY = 'ragitify-ui-style';
const DEFAULT_THEME: ThemeMode = 'light';
const DEFAULT_STYLE: UIStyle = 'default';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeSubject = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
  private readonly preferenceSubject = new BehaviorSubject<ThemePreference>(this.getInitialPreference());
  private readonly styleSubject = new BehaviorSubject<UIStyle>(this.getInitialStyle());
  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;

  readonly theme$ = this.themeSubject.asObservable();
  readonly preference$ = this.preferenceSubject.asObservable();
  readonly style$ = this.styleSubject.asObservable();

  constructor() {
    this.applyStyle(this.styleSubject.value);
    // Recompute theme from preference + system on init so the right OS shade
    // is applied if the user has chosen "system".
    this.applyForPreference(this.preferenceSubject.value);
    this.installSystemListener();

    // Listen for changes in other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === PREFERENCE_KEY) {
        const next = event.newValue as ThemePreference;
        if (next === 'light' || next === 'dark' || next === 'system') {
          this.preferenceSubject.next(next);
          this.applyForPreference(next);
        }
      } else if (event.key === STORAGE_KEY) {
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
    localStorage.removeItem(PREFERENCE_KEY);
  }

  /**
   * Force the theme to Light Mode (and persist it).
   * Used to ensure a consistent default theme upon login.
   */
  forceLightTheme(): void {
    this.setPreference('light');
  }

  /**
   * Quick light <-> dark toggle. Sets an explicit preference (drops "system").
   */
  toggleTheme(): void {
    const nextTheme: ThemeMode = this.themeSubject.value === 'dark' ? 'light' : 'dark';
    this.setPreference(nextTheme);
  }

  /**
   * Explicitly set a theme (light or dark). Persists the preference.
   */
  setTheme(theme: ThemeMode): void {
    this.setPreference(theme);
  }

  /**
   * Set the theme preference. "system" follows the OS / browser setting and
   * updates live when the user changes it.
   */
  setPreference(preference: ThemePreference): void {
    this.preferenceSubject.next(preference);
    localStorage.setItem(PREFERENCE_KEY, preference);
    if (preference === 'light' || preference === 'dark') {
      localStorage.setItem(STORAGE_KEY, preference);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.applyForPreference(preference);
  }

  getCurrentPreference(): ThemePreference {
    return this.preferenceSubject.value;
  }

  getCurrentTheme(): ThemeMode {
    return this.themeSubject.value;
  }

  setStyle(style: UIStyle): void {
    if (this.styleSubject.value === style) {
      return;
    }
    this.styleSubject.next(style);
    localStorage.setItem(STYLE_STORAGE_KEY, style);
    this.applyStyle(style);
  }

  private getInitialPreference(): ThemePreference {
    const stored = localStorage.getItem(PREFERENCE_KEY) as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    // Backwards-compat: if only the legacy STORAGE_KEY is present, mirror it.
    const legacy = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (legacy === 'light' || legacy === 'dark') {
      return legacy;
    }
    return DEFAULT_THEME;
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

  private applyForPreference(preference: ThemePreference): void {
    const resolved: ThemeMode = preference === 'system'
      ? (this.systemPrefersDark() ? 'dark' : 'light')
      : preference;
    if (this.themeSubject.value !== resolved) {
      this.themeSubject.next(resolved);
    }
    this.applyTheme(resolved);
  }

  private systemPrefersDark(): boolean {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private installSystemListener(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQueryHandler = () => {
      if (this.preferenceSubject.value === 'system') {
        this.applyForPreference('system');
      }
    };
    // addEventListener is the modern API; Safari < 14 falls back to addListener.
    if (typeof this.mediaQuery.addEventListener === 'function') {
      this.mediaQuery.addEventListener('change', this.mediaQueryHandler);
    } else if (typeof (this.mediaQuery as any).addListener === 'function') {
      (this.mediaQuery as any).addListener(this.mediaQueryHandler);
    }
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
