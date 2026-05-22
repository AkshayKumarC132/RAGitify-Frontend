import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

/**
 * Inverse of AuthGuard — bounces already-authenticated users away from public
 * auth-only pages (login, register, forgot/reset password). Avoids the
 * awkward state where a signed-in user can land on the reset-password page.
 */
@Injectable({ providedIn: 'root' })
export class UnauthenticatedOnlyGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): boolean | UrlTree {
        if (this.authService.isAuthenticated()) {
            return this.router.createUrlTree(['/home']);
        }
        return true;
    }
}
