import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthResponse } from '../models/user.model';
import { SKIP_API_ERROR_ALERT } from '../interceptors/api-error-alert.interceptor';

export type OAuthProvider = 'google' | 'microsoft' | 'github';

export interface OAuthStartResponse {
    authorize_url: string;
    state: string;
    provider: string;
}

export interface OAuthCallbackPayload {
    code: string;
    state: string;
}

@Injectable({ providedIn: 'root' })
export class OAuthService {
    /** localStorage key for the pending OAuth state, set when start() succeeds. */
    private readonly PENDING_KEY = 'ragitify-oauth-pending';

    constructor(private api: ApiService) {}

    /**
     * Ask the backend to mint an authorization URL for the given provider.
     * Returns a 503 if the provider isn't configured server-side.
     */
    start(provider: OAuthProvider, redirectUri?: string): Observable<OAuthStartResponse> {
        // Suppress the global error alert — the caller handles 503 with its own UI.
        const context = new HttpContext().set(SKIP_API_ERROR_ALERT, true);
        const body: Record<string, string> = {};
        if (redirectUri) {
            body['redirect_uri'] = redirectUri;
        }
        return this.api.post<OAuthStartResponse>(
            `/oauth/${provider}/start/`,
            body,
            undefined,
            context
        );
    }

    /**
     * Complete the OAuth dance by handing the authorization code back to the
     * backend in exchange for a session token. Same shape as a normal login.
     */
    complete(provider: OAuthProvider, payload: OAuthCallbackPayload): Observable<AuthResponse> {
        const context = new HttpContext().set(SKIP_API_ERROR_ALERT, true);
        return this.api.post<AuthResponse>(
            `/oauth/${provider}/callback/`,
            payload,
            undefined,
            context
        );
    }

    rememberPending(provider: OAuthProvider, state: string): void {
        try {
            localStorage.setItem(this.PENDING_KEY, JSON.stringify({ provider, state, at: Date.now() }));
        } catch {
            // Ignore quota / privacy-mode errors.
        }
    }

    consumePending(): { provider: OAuthProvider; state: string } | null {
        try {
            const raw = localStorage.getItem(this.PENDING_KEY);
            if (!raw) return null;
            localStorage.removeItem(this.PENDING_KEY);
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.provider || !parsed.state) return null;
            // Expire pending state after 10 minutes — matches the backend cache TTL.
            if (typeof parsed.at === 'number' && Date.now() - parsed.at > 10 * 60 * 1000) {
                return null;
            }
            return { provider: parsed.provider, state: parsed.state };
        } catch {
            return null;
        }
    }
}
