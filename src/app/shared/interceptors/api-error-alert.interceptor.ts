import { Injectable } from '@angular/core';
import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiAlertService } from '../services/api-alert.service';

export const SKIP_API_ERROR_ALERT = new HttpContextToken<boolean>(() => false);

@Injectable()
export class ApiErrorAlertInterceptor implements HttpInterceptor {
  constructor(private apiAlertService: ApiAlertService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        const skipAlert = request.context.get(SKIP_API_ERROR_ALERT);
        const isChatPath = [
          '/run/',
          '/thread/',
          '/message/',
          '/conversation/',
          '/response/'
        ].some(path => request.url.includes(path));

        if (!skipAlert && !isChatPath) {
          this.apiAlertService.showHttpError(error);
        }

        return throwError(() => error);
      })
    );
  }
}
