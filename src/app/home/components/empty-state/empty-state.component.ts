import { Component } from '@angular/core';
import { AuthService } from '../../../shared/services/auth.service';
import { User } from '../../../shared/models/user.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss']
})
export class EmptyStateComponent {
  userName$: Observable<string>;

  constructor(private authService: AuthService) {
    this.userName$ = this.authService.currentUser$.pipe(
      map(user => {
        if (user?.first_name && user?.last_name) {
          return `${user.first_name} ${user.last_name}`;
        } else if (user?.first_name) {
          return user.first_name;
        } else {
          return user?.username || 'there';
        }
      })
    );
  }
}

