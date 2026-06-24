import { Component } from '@angular/core';
import { ThemeService, UIStyle } from '../../../shared/services/theme.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-general-section',
  templateUrl: './general-section.component.html',
  styleUrls: ['./general-section.component.scss']
})
export class GeneralSectionComponent {
  theme$: Observable<'light' | 'dark'>;
  style$: Observable<UIStyle>;

  constructor(private themeService: ThemeService) {
    this.theme$ = this.themeService.theme$;
    this.style$ = this.themeService.style$;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.themeService.setTheme(theme);
  }

  setStyle(style: UIStyle): void {
    this.themeService.setStyle(style);
  }
}

