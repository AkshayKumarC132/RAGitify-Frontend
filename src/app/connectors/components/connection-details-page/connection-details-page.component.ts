import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection, DatabaseSyncLog } from '../../../shared/models/database-connection.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
    selector: 'app-connection-details-page',
    templateUrl: './connection-details-page.component.html',
    styleUrls: ['./connection-details-page.component.scss']
})
export class ConnectionDetailsPageComponent implements OnInit, OnDestroy {
    connectionId!: string;

    connection: DatabaseConnection | null = null;
    loading = false;
    error: string | null = null;
    syncing = false;
    syncHistory: DatabaseSyncLog[] = [];
    groupedSyncHistory: { dateLabel: string, logs: DatabaseSyncLog[] }[] = [];

    private destroy$ = new Subject<void>();

    constructor(
        private dbConnectionService: DatabaseConnectionService,
        private route: ActivatedRoute,
        private router: Router,
        private confirmService: ConfirmDialogService
    ) { }

    ngOnInit(): void {
        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.connectionId = id;
                this.connection = null;
                this.syncHistory = [];
                this.groupedSyncHistory = [];
                this.error = null;
                this.loadConnection();
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadConnection(): void {
        this.loading = true;
        this.error = null;
        this.dbConnectionService.getById(this.connectionId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (conn) => {
                    this.connection = conn;
                    this.loading = false;
                    this.loadSyncHistory();
                },
                error: (err) => {
                    console.error(err);
                    this.error = 'Failed to load connection details.';
                    this.loading = false;
                }
            });
    }

    loadSyncHistory(): void {
        if (!this.connectionId) return;
        this.dbConnectionService.getSyncHistory(this.connectionId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (history) => {
                    this.syncHistory = history;
                    this.updateGroupedSyncHistory();
                },
                error: (err) => {
                    console.error('Failed to load sync history', err);
                }
            });
    }

    syncDatabase(): void {
        if (!this.connection?.id) return;
        this.syncing = true;
        this.dbConnectionService.syncDatabase(this.connection.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (result) => {
                    this.syncing = false;
                    if (result.connection) {
                        this.connection = result.connection;
                    } else {
                        this.loadConnection();
                    }
                    if (result.sync_log) {
                        this.syncHistory = [result.sync_log, ...this.syncHistory];
                        this.updateGroupedSyncHistory();
                    } else {
                        this.loadSyncHistory();
                    }
                },
                error: (err) => {
                    console.error('Failed to sync database', err);
                    this.syncing = false;
                    this.loadConnection();
                    this.loadSyncHistory();
                }
            });
    }

    onClose(): void {
        this.router.navigate(['/connectors']);
    }

    async deleteConnection(): Promise<void> {
        if (!this.connection?.id) return;

        const confirmed = await this.confirmService.confirm({
            title: 'Delete Connection',
            message: 'Are you sure you want to delete this connection?',
            itemName: this.connection.name || this.connection.database_name,
            secondaryMessage: 'This action cannot be undone and will remove all associated metadata.',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            this.dbConnectionService.delete(this.connection.id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.onClose();
                    },
                    error: (err) => {
                        console.error('Failed to delete connection', err);
                    }
                });
        }
    }

    formatDateTime(dateStr?: string): string {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    }

    formatTime(dateStr?: string): string {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }

    formatDuration(ms: number): string {
        if (!ms) return '0s';
        if (ms < 1000) return `${Math.round(ms)}ms`;
        const totalSeconds = Math.round(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    }

    formatDateLabel(dateStr: string): string {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
        const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        const formattedDate = date.toLocaleDateString('en-US', options);

        if (isToday) return `Today ${formattedDate}`;
        if (isYesterday) return `Yesterday ${formattedDate}`;
        return formattedDate;
    }

    updateGroupedSyncHistory(): void {
        const groups = new Map<string, DatabaseSyncLog[]>();

        for (const log of this.syncHistory) {
            const label = this.formatDateLabel(log.started_at);
            if (!groups.has(label)) {
                groups.set(label, []);
            }
            groups.get(label)!.push(log);
        }

        this.groupedSyncHistory = Array.from(groups.entries()).map(([dateLabel, logs]) => ({
            dateLabel,
            logs
        }));
    }

    getStatusColor(status?: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'connected' || s === 'success') return '#10b981';
        if (s === 'failed' || s === 'error') return '#ef4444';
        return '#64748b';
    }

    getSyncStatusColor(status?: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'success') return '#10b981';
        if (s === 'failed') return '#ef4444';
        return '#64748b';
    }
}
