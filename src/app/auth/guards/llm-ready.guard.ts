import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../shared/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class LlmReadyGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    const token = this.authService.getToken();
    if (!token) {
      return of(this.router.parseUrl('/auth/login'));
    }

    return this.authService.ensureStatus().pipe(
      map(status => {
        if (this.authService.isLlmReady(status)) {
          return true;
        }
        return this.router.createUrlTree(['/setup-llm'], { queryParams: { reason: 'llm_required' } });
      }),
      catchError(() => of(this.router.createUrlTree(['/setup-llm'], { queryParams: { reason: 'llm_required' } })))
    );
  }
}
