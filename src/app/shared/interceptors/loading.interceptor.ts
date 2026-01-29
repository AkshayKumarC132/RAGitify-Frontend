import { Injectable } from '@angular/core';
import { HttpContextToken, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private loadingService: LoadingService) { }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const skipLoadingToken = request.context.get(SKIP_LOADING);

    // Auto-skip loading for chat-related endpoints to prevent global spinner
    // "Typing..." indicators in the chat UI will handle feedback
    const isChatPath = [
      '/run/',
      '/thread/',
      '/message/',
      '/conversation/',
      '/response/'
    ].some(path => request.url.includes(path));

    const skipLoading = skipLoadingToken || isChatPath;

    if (!skipLoading) {
      this.loadingService.show();
    }

    return next.handle(request).pipe(
      finalize(() => {
        if (!skipLoading) {
          this.loadingService.hide();
        }
      })
    );
  }
}
