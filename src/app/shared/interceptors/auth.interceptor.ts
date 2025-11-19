import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.getToken();

    if (token) {
      const cloned = req.clone({
        setHeaders: {
          Authorization: `Token ${token}`
        }
      });
      return next.handle(cloned).pipe(
        catchError((error: HttpErrorResponse) => this.handleError(error))
      );
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error))
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 401 || error.status === 403) {
      this.authService.forceLogout();
    }

    return throwError(() => error);
  }
}

