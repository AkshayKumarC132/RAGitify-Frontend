import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-settings-layout',
  templateUrl: './settings-layout.component.html',
  styleUrls: ['./settings-layout.component.scss']
})
export class SettingsLayoutComponent implements OnInit, OnDestroy {
  readonly sections = [
    { label: 'General', route: 'general', icon: 'fa-gear', description: 'Appearance, theme, and app experience' },
    { label: 'Models', route: 'models', icon: 'fa-robot', description: 'Providers, models, and LLM configuration' },
    { label: 'Skills', route: 'skills', icon: 'fa-wand-magic-sparkles', description: 'Custom assistant behaviors and instructions' },
    { label: 'Usage', route: 'usage', icon: 'fa-chart-simple', description: 'Token usage, costs, and activity tracking' },
    { label: 'Account', route: 'account', icon: 'fa-user', description: 'Profile details and account information' }
  ];

  currentSectionLabel = 'General';
  private destroy$ = new Subject<void>();

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.syncCurrentSection(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        this.syncCurrentSection(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToHome(): void {
    this.router.navigate(['/home']);
  }

  private syncCurrentSection(url: string): void {
    const matched = this.sections.find(section => url.includes(`/settings/${section.route}`));
    this.currentSectionLabel = matched?.label || 'General';
  }
}
