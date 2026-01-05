import { Component } from '@angular/core';
import { ThemeService } from '../../../shared/services/theme.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-general-section',
  templateUrl: './general-section.component.html',
  styleUrls: ['./general-section.component.scss']
})
export class GeneralSectionComponent {
  theme$: Observable<'light' | 'dark'>;

  constructor(private themeService: ThemeService) {
    this.theme$ = this.themeService.theme$;
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}

