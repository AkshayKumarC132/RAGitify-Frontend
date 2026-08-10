import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection, DatabaseSyncLog } from '../../../shared/models/database-connection.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ConnectionShareService } from '../../../shared/services/connection-share.service';
import { ConnectionSyncService } from '../../../shared/services/connection-sync.service';
import { User } from '../../../shared/models/user.model';
import Swal from 'sweetalert2';

export interface GroupedSyncHistory {
    dateLabel: string;
    logs: DatabaseSyncLog[];
    isCollapsed: boolean;
}

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
    editingConnection: DatabaseConnection | null = null;
    editConnectionSaving = false;
    syncHistory: DatabaseSyncLog[] = [];
    groupedSyncHistory: GroupedSyncHistory[] = [];

    // Share modal state
    shareDialogOpen = false;
    shareSubmitting = false;
    shareTargetEmail = '';
    shareExpiresAt = '';
    shareUsers: User[] = [];
    filteredShareUsers: User[] = [];
    loadingShareUsers = false;
    showShareUserDropdown = false;
    private hasLoadedShareUsers = false;

    // Chat drawer state
    showConnectionChat = false;

    private destroy$ = new Subject<void>();

    constructor(
        private dbConnectionService: DatabaseConnectionService,
        private route: ActivatedRoute,
        private router: Router,
        private confirmService: ConfirmDialogService,
        private toastService: ToastService,
        private authService: AuthService,
        private connectionShareService: ConnectionShareService,
        private connectionSyncService: ConnectionSyncService
    ) { }

    get syncing(): boolean {
        return this.connectionId ? this.connectionSyncService.isSyncing(this.connectionId) : false;
    }

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

        this.connectionSyncService.onSyncCompleted$
            .pipe(takeUntil(this.destroy$))
            .subscribe(({ connectionId, result }) => {
                if (connectionId === this.connectionId) {
                    // Sync finished for this connection, reload details to get new state/history
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
        this.connectionSyncService.startSync(this.connection.id, this.connection.name || this.connection.database_name);
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

    openEditModal(): void {
        this.editConnectionSaving = false;
        this.editingConnection = this.connection;
    }

    closeEditModal(): void {
        this.editConnectionSaving = false;
        this.editingConnection = null;
    }

    saveEditedConnection(updates: Partial<DatabaseConnection>): void {
        if (!this.connection?.id) return;

        this.editConnectionSaving = true;
        this.dbConnectionService.update(this.connection.id, updates)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (updatedConn) => {
                    this.connection = updatedConn;
                    this.closeEditModal();
                },
                error: (err) => {
                    console.error('Failed to update connection:', err);
                    this.toastService.error('Update Failed', err?.error?.message || 'An error occurred while updating the connection.');
                    this.editConnectionSaving = false;
                }
            });
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

        const currentCollapsedMap = new Map<string, boolean>();
        for (const group of this.groupedSyncHistory) {
            if (group.isCollapsed !== undefined) {
                currentCollapsedMap.set(group.dateLabel, group.isCollapsed);
            }
        }

        this.groupedSyncHistory = Array.from(groups.entries()).map(([dateLabel, logs]) => ({
            dateLabel,
            logs,
            isCollapsed: currentCollapsedMap.has(dateLabel) ? currentCollapsedMap.get(dateLabel)! : true
        }));
    }

    toggleDateGroup(group: GroupedSyncHistory): void {
        group.isCollapsed = !group.isCollapsed;
    }

    onDateGroupKeydown(event: KeyboardEvent, group: GroupedSyncHistory): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.toggleDateGroup(group);
        }
    }

    toggleAllDateGroups(): void {
        const shouldCollapse = !this.areAllCollapsed;
        for (const group of this.groupedSyncHistory) {
            group.isCollapsed = shouldCollapse;
        }
    }

    get areAllCollapsed(): boolean {
        if (!this.groupedSyncHistory || this.groupedSyncHistory.length === 0) return false;
        return this.groupedSyncHistory.every(g => g.isCollapsed);
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

    get lastSyncTime(): string {
        if (this.syncHistory && this.syncHistory.length > 0) {
            return this.formatDateTime(this.syncHistory[0].started_at);
        }
        return this.connection?.schema_synced_at ? this.formatDateTime(this.connection.schema_synced_at) : '-';
    }

    get avgSyncDuration(): string {
        if (!this.syncHistory || this.syncHistory.length === 0) return '-';
        const total = this.syncHistory.reduce((sum, log) => sum + (log.duration_ms || 0), 0);
        const avg = total / this.syncHistory.length;
        return this.formatDuration(avg);
    }

    get syncFrequency(): string {
        const metadata = this.connection?.metadata || {};
        const frequency = metadata['sync_frequency'] ?? metadata['syncFrequency'];
        if (typeof frequency === 'string' && frequency.trim()) {
            const frequencyNumber = Number(frequency);
            if (Number.isFinite(frequencyNumber)) {
                return this.formatSyncFrequencyHours(frequencyNumber);
            }
            return frequency.trim();
        }
        if (typeof frequency === 'number' && Number.isFinite(frequency)) {
            return this.formatSyncFrequencyHours(frequency);
        }

        const frequencyHours = metadata['sync_frequency_hours'] ?? metadata['syncFrequencyHours'];
        if (typeof frequencyHours === 'string' && frequencyHours.trim()) {
            const frequencyHoursNumber = Number(frequencyHours);
            if (Number.isFinite(frequencyHoursNumber)) {
                return this.formatSyncFrequencyHours(frequencyHoursNumber);
            }
        }
        if (typeof frequencyHours === 'number' && Number.isFinite(frequencyHours)) {
            return this.formatSyncFrequencyHours(frequencyHours);
        }

        return 'Manual';
    }

    private formatSyncFrequencyHours(hours: number): string {
        if (hours <= 0) return 'Manual';
        if (hours === 1) return 'Hourly';
        if (hours < 1) return `Every ${Math.round(hours * 60)} minutes`;
        return `Every ${hours} hours`;
    }

    get isShareTargetValid(): boolean {
        const email = this.shareTargetEmail.trim().toLowerCase();
        if (!email) return false;
        return this.shareUsers.some(user => (user.email || '').toLowerCase() === email);
    }

    get canShareConnection(): boolean {
        return !!this.connection && !this.hasFailed;
    }

    get hasFailed(): boolean {
        if (!this.connection) return false;
        const s = (this.connection.status || '').toLowerCase();
        return s === 'failed' || s === 'error';
    }

    openShareDialog(): void {
        if (!this.connection) {
            void Swal.fire({
                title: 'Nothing to share',
                text: 'Connection details are not loaded.',
                icon: 'info',
                confirmButtonText: 'Close'
            });
            return;
        }

        this.shareTargetEmail = '';
        this.shareExpiresAt = '';
        this.showShareUserDropdown = false;
        this.loadShareUsers();
        this.shareDialogOpen = true;
    }

    closeShareDialog(): void {
        this.shareDialogOpen = false;
        this.shareSubmitting = false;
        this.showShareUserDropdown = false;
        this.shareTargetEmail = '';
        this.shareExpiresAt = '';
    }

    onShareTargetFocus(): void {
        this.showShareUserDropdown = true;
        this.filteredShareUsers = this.shareUsers;
        this.loadShareUsers();
    }

    onShareTargetInput(event: Event): void {
        const value = ((event.target as HTMLInputElement).value || '').trim().toLowerCase();
        this.shareTargetEmail = (event.target as HTMLInputElement).value || '';
        this.filteredShareUsers = this.shareUsers.filter(user =>
            (user.email || '').toLowerCase().includes(value)
        );
        this.showShareUserDropdown = true;
    }

    onShareTargetBlur(): void {
        setTimeout(() => {
            this.showShareUserDropdown = false;
        }, 200);
    }

    selectShareUser(user: User): void {
        this.shareTargetEmail = user.email;
        this.showShareUserDropdown = false;
    }

    submitShare(): void {
        const email = this.shareTargetEmail.trim();
        if (!this.connection || !email || this.shareSubmitting || !this.isShareTargetValid) {
            return;
        }

        this.shareSubmitting = true;
        this.connectionShareService.share({
            connection_ids: [this.connection.id!],
            target_user_email: email,
            expires_at: this.shareExpiresAt ? new Date(this.shareExpiresAt).toISOString() : null
        }).subscribe({
            next: () => {
                this.shareSubmitting = false;
                this.closeShareDialog();
                void Swal.fire({
                    icon: 'success',
                    iconHtml: '<i class="fa-solid fa-check"></i>',
                    title: 'Share updated',
                    html: `
                        <div class="ragitify-swal-success-body">
                            <p class="ragitify-swal-success-copy">
                                Connection <strong>${this.connection?.name || this.connection?.database_name}</strong> shared successfully.
                            </p>
                            <div class="ragitify-swal-success-meta">
                                The selected recipient (${email}) can now access this shared connection.
                            </div>
                        </div>
                    `,
                    confirmButtonText: 'Done',
                    customClass: {
                        popup: 'ragitify-swal-success-popup',
                        title: 'ragitify-swal-success-title',
                        htmlContainer: 'ragitify-swal-success-html',
                        actions: 'ragitify-swal-success-actions',
                        confirmButton: 'ragitify-swal-success-confirm'
                    }
                });
            },
            error: (err) => {
                this.shareSubmitting = false;
                void Swal.fire({
                    title: 'Unable to share connection',
                    text: this.extractErrorMessage(err, 'The share request could not be completed.'),
                    icon: 'error',
                    confirmButtonText: 'Close'
                });
            }
        });
    }

    private extractErrorMessage(error: unknown, fallback: string): string {
        const candidate = error as { error?: { error?: string; detail?: string; message?: string }; message?: string };
        return candidate?.error?.error || candidate?.error?.detail || candidate?.error?.message || candidate?.message || fallback;
    }

    private loadShareUsers(): void {
        if (this.loadingShareUsers || this.hasLoadedShareUsers) {
            return;
        }

        this.loadingShareUsers = true;
        this.authService.listUsers().subscribe({
            next: (users: User[]) => {
                const currentUser = this.authService.getStoredUser();
                this.shareUsers = users.filter((user: User) => user.id !== currentUser?.id);
                this.filteredShareUsers = this.shareUsers;
                this.hasLoadedShareUsers = true;
                this.loadingShareUsers = false;
            },
            error: () => {
                this.loadingShareUsers = false;
            }
        });
    }

    openConnectionChat(): void {
        this.showConnectionChat = true;
    }

    closeConnectionChat(): void {
        this.showConnectionChat = false;
    }

    get connectionTypeName(): string {
        if (!this.connection) return '-';

        const typeObjName = this.connection.connection_type?.name;
        if (typeObjName) return typeObjName;

        const driver = (this.connection.connection_type?.driver_name || '').toLowerCase();
        if (driver.includes('postgres')) return 'PostgreSQL';
        if (driver.includes('clickhouse')) return 'ClickHouse';
        if (driver.includes('mysql')) return 'MySQL';
        if (driver.includes('mongodb')) return 'MongoDB';
        if (driver.includes('redis')) return 'Redis';
        if (driver.includes('snowflake')) return 'Snowflake';
        if (driver.includes('bigquery')) return 'BigQuery';

        const metaType = (this.connection.metadata?.['connection_type'] || this.connection.metadata?.['type'] || '').toString().toLowerCase();
        if (metaType.includes('clickhouse')) return 'ClickHouse';
        if (metaType.includes('postgres')) return 'PostgreSQL';
        if (metaType.includes('mysql')) return 'MySQL';

        if (this.connection.port === 8123 || this.connection.port === 9000) return 'ClickHouse';
        return 'PostgreSQL';
    }

    get connectionTypeIcon(): string {
        const typeName = this.connectionTypeName.toLowerCase();
        if (typeName.includes('clickhouse')) return 'assets/clickhouse.svg';
        if (typeName.includes('mysql')) return 'assets/mysql.svg';
        if (typeName.includes('mongodb')) return 'assets/mongodb.svg';
        if (typeName.includes('redis')) return 'assets/redis.svg';
        if (typeName.includes('snowflake')) return 'assets/snowflake.svg';
        if (typeName.includes('bigquery')) return 'assets/bigquery.svg';
        return 'assets/postgres.svg';
    }
}
