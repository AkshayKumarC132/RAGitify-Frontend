import { Component, Input, Output, EventEmitter } from '@angular/core';
import { AuthService } from '../../../shared/services/auth.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss']
})
export class EmptyStateComponent {
  @Input() isTemporaryChat = false;
  @Input() mode: 'normal' | 'web' | 'document' = 'normal';
  @Input() hasDocuments = false;
  @Output() viewLibrary = new EventEmitter<void>();

  userName$: Observable<string>;
  greeting$: Observable<string>;

  constructor(private authService: AuthService) {
    this.userName$ = this.authService.currentUser$.pipe(
      map(user => {
        if (user?.first_name && user?.last_name) {
          return `${user.first_name} ${user.last_name}`;
        } else if (user?.first_name) {
          return user.first_name;
        } else {
          const raw = user?.username || user?.email;
          if (!raw) {
            return 'there';
          }
          const username = raw.includes('@') ? raw.split('@')[0] : raw;
          return username;
        }
      })
    );

    this.greeting$ = this.authService.currentUser$.pipe(
      map(user => {
        // Same name resolution as above
        let name: string;
        if (user?.first_name && user?.last_name) {
          name = `${user.first_name} ${user.last_name}`;
        } else if (user?.first_name) {
          name = user.first_name;
        } else {
          const raw = user?.username || user?.email;
          if (!raw) {
            name = 'there';
          } else {
            const username = raw.includes('@') ? raw.split('@')[0] : raw;
            name = username;
          }
        }

        const now = new Date();
        const hour = now.getHours();

        let baseGreeting: string;
        if (hour < 12) {
          baseGreeting = 'Good morning';
        } else if (hour < 18) {
          baseGreeting = 'Good afternoon';
        } else {
          baseGreeting = 'Good evening';
        }

        // Always use time-based greeting; no "welcome back" logic
        return `${baseGreeting}, ${name}`;
      })
    );
  }





  onLibraryClick(): void {
    this.viewLibrary.emit();
  }
}