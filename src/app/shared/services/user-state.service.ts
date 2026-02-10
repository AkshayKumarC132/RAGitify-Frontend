import { Injectable } from '@angular/core';

/**
 * Centralized service that tracks the authenticated user identity and
 * coordinates cache invalidation across all user-scoped data services.
 *
 * This service is intentionally kept dependency-free (no injection of
 * other data services) to avoid circular-dependency issues.  Instead,
 * each data service registers a reset callback via `registerResetFn`.
 */
@Injectable({
    providedIn: 'root'
})
export class UserStateService {
    private _currentUserId: number | null = null;
    private resetFns: (() => void)[] = [];

    /** The user ID whose data is currently cached across services. */
    get currentUserId(): number | null {
        return this._currentUserId;
    }

    /** Record which user's data is now active. */
    setCurrentUserId(userId: number | null): void {
        this._currentUserId = userId;
    }

    /** Returns `true` when the given id matches the currently tracked user. */
    isCurrentUser(userId: number | null): boolean {
        return userId !== null && userId === this._currentUserId;
    }

    /**
     * Data services call this once (typically in their constructor) to
     * register their cache-invalidation function.
     */
    registerResetFn(fn: () => void): void {
        this.resetFns.push(fn);
    }

    /**
     * Purge every registered service cache and clear the tracked user ID.
     * Called by AuthService on logout / user change.
     */
    resetAllCaches(): void {
        this._currentUserId = null;
        this.resetFns.forEach(fn => fn());
    }
}
