import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { DatabaseConnectionService } from './database-connection.service';
import { ToastService } from './toast.service';
import { DatabaseSyncLog, DatabaseConnection } from '../models/database-connection.model';

export type ConnectionSyncState = 'syncing' | 'success' | 'failed';

export interface SyncResult {
    state: ConnectionSyncState;
    syncLog?: DatabaseSyncLog | null;
    connection?: DatabaseConnection | null;
}

@Injectable({
    providedIn: 'root'
})
export class ConnectionSyncService implements OnDestroy {

    // Map of connectionId → SyncResult for active/recently-completed syncs
    private syncStateMap = new Map<string, SyncResult>();
    private syncStateSubject = new BehaviorSubject<Map<string, SyncResult>>(new Map());

    /** Observable that emits whenever any connection's sync state changes. */
    syncState$ = this.syncStateSubject.asObservable();

    // Track active subscriptions so we can clean up on destroy
    private activeSubscriptions = new Map<string, Subscription>();

    // Cleanup timers
    private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // Notifies subscribers when a specific connection's sync completes
    private syncCompleted$ = new Subject<{ connectionId: string; result: SyncResult }>();

    /** Subscribe to be notified when a specific connection finishes syncing. */
    onSyncCompleted$ = this.syncCompleted$.asObservable();

    constructor(
        private dbConnectionService: DatabaseConnectionService,
        private toastService: ToastService
    ) {}

    /**
     * Start a background sync for the given connection.
     * Safe to call multiple times — if a sync is already in progress for
     * this connection, this call is a no-op.
     */
    startSync(connectionId: string, connectionName: string): void {
        if (this.isSyncing(connectionId)) {
            return; // Already syncing
        }

        // Cancel any pending cleanup timer for this connection
        const existingTimer = this.cleanupTimers.get(connectionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.cleanupTimers.delete(connectionId);
        }

        this.updateState(connectionId, { state: 'syncing' });

        const sub = this.dbConnectionService.syncDatabase(connectionId).subscribe({
            next: (result) => {
                const hasFailed = result.connection?.status === 'failed';
                const syncResult: SyncResult = {
                    state: hasFailed ? 'failed' : 'success',
                    syncLog: result.sync_log,
                    connection: result.connection
                };

                this.updateState(connectionId, syncResult);

                if (hasFailed) {
                    this.toastService.warning(
                        'Sync Failed',
                        result.connection?.status_message ||
                        `Could not sync "${connectionName}". Check connection settings.`,
                        6000
                    );
                } else {
                    this.toastService.success(
                        'Sync Complete',
                        `"${connectionName}" schema is up to date.`,
                        4000
                    );
                }

                this.syncCompleted$.next({ connectionId, result: syncResult });
                this.scheduleCleanup(connectionId);
                this.activeSubscriptions.delete(connectionId);
            },
            error: (err) => {
                const errorMessage =
                    err?.error?.message ||
                    err?.error?.detail ||
                    err?.message ||
                    `Could not sync "${connectionName}".`;

                const syncResult: SyncResult = { state: 'failed' };
                this.updateState(connectionId, syncResult);
                this.toastService.error('Sync Failed', errorMessage, 6000);
                this.syncCompleted$.next({ connectionId, result: syncResult });
                this.scheduleCleanup(connectionId);
                this.activeSubscriptions.delete(connectionId);
            }
        });

        this.activeSubscriptions.set(connectionId, sub);
    }

    /** Returns true if the given connection is currently being synced. */
    isSyncing(connectionId: string): boolean {
        return this.syncStateMap.get(connectionId)?.state === 'syncing';
    }

    /** Returns the current sync state for a connection, or null if none. */
    getSyncState(connectionId: string): SyncResult | null {
        return this.syncStateMap.get(connectionId) ?? null;
    }

    /** Returns the last sync result for a connection (available briefly after completion). */
    getLastSyncResult(connectionId: string): SyncResult | null {
        const state = this.syncStateMap.get(connectionId);
        if (!state || state.state === 'syncing') return null;
        return state;
    }

    /** Returns a snapshot of all connection IDs currently being synced. */
    getSyncingIds(): string[] {
        const ids: string[] = [];
        this.syncStateMap.forEach((result, id) => {
            if (result.state === 'syncing') ids.push(id);
        });
        return ids;
    }

    private updateState(connectionId: string, result: SyncResult): void {
        this.syncStateMap.set(connectionId, result);
        // Emit a new Map reference so OnPush components detect the change
        this.syncStateSubject.next(new Map(this.syncStateMap));
    }

    /** Remove the state entry after a short delay so components can react to success/failure. */
    private scheduleCleanup(connectionId: string, delayMs = 8000): void {
        const timer = setTimeout(() => {
            this.syncStateMap.delete(connectionId);
            this.syncStateSubject.next(new Map(this.syncStateMap));
            this.cleanupTimers.delete(connectionId);
        }, delayMs);
        this.cleanupTimers.set(connectionId, timer);
    }

    ngOnDestroy(): void {
        this.activeSubscriptions.forEach(sub => sub.unsubscribe());
        this.cleanupTimers.forEach(timer => clearTimeout(timer));
        this.syncCompleted$.complete();
        this.syncStateSubject.complete();
    }
}
