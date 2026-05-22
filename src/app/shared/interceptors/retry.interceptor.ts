import { Injectable } from '@angular/core';
import {
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { mergeMap, retryWhen, take } from 'rxjs/operators';

/**
 * Retries idempotent GET requests once on transient network failures.
 *
 * Triggers on:
 *  - status 0 (no network / CORS / DNS)
 *  - status 502 / 503 / 504 (upstream temporary)
 *
 * Does NOT retry:
 *  - non-GET methods (avoids double-applying mutations)
 *  - 4xx responses (the server actively rejected; retrying won't help)
 *  - requests opted out via the X-No-Retry header
 *
 * Uses a short fixed delay (350ms) — enough to ride out a brief blip without
 * making spinners feel stuck.
 */
@Injectable()
export class RetryInterceptor implements HttpInterceptor {
    private static readonly RETRYABLE_STATUSES = new Set<number>([0, 502, 503, 504]);
    private static readonly MAX_RETRIES = 1;
    private static readonly DELAY_MS = 350;

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (req.method !== 'GET' || req.headers.has('X-No-Retry')) {
            return next.handle(req);
        }

        return next.handle(req).pipe(
            retryWhen(errors => errors.pipe(
                mergeMap((err, attemptIdx) => {
                    const isRetryable = err instanceof HttpErrorResponse
                        && RetryInterceptor.RETRYABLE_STATUSES.has(err.status);
                    if (!isRetryable || attemptIdx >= RetryInterceptor.MAX_RETRIES) {
                        return throwError(() => err);
                    }
                    return timer(RetryInterceptor.DELAY_MS);
                }),
                take(RetryInterceptor.MAX_RETRIES + 1)
            ))
        );
    }
}
