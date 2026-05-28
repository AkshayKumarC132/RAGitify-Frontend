import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';

export interface ConnectorType {
    id: string;
    name: string;
    description: string;
    icon: string;
    iconColor: string;
    iconBgColor: string;
    available: boolean;
}

@Component({
    selector: 'app-workspace-connections',
    templateUrl: './workspace-connections.component.html',
    styleUrls: ['./workspace-connections.component.scss']
})
export class WorkspaceConnectionsComponent implements OnInit, OnDestroy {
    connectorTypes: ConnectorType[] = [
        {
            id: 'postgresql',
            name: 'PostgreSQL',
            description: 'Relational database for transactional and analytical workloads.',
            icon: 'fa-solid fa-database',
            iconColor: '#3b82f6',
            iconBgColor: '#e0e9ff',
            available: true
        },
        {
            id: 'clickhouse',
            name: 'ClickHouse',
            description: 'Column-oriented OLAP database for real-time analytics.',
            icon: 'fa-solid fa-layer-group',
            iconColor: '#f59e0b',
            iconBgColor: '#fef3c7',
            available: false
        },
        {
            id: 'mysql',
            name: 'MySQL',
            description: 'Popular open-source relational database.',
            icon: 'fa-solid fa-server',
            iconColor: '#ef4444',
            iconBgColor: '#fee2e2',
            available: false
        },
        {
            id: 'mongodb',
            name: 'MongoDB',
            description: 'Document-oriented NoSQL database.',
            icon: 'fa-solid fa-leaf',
            iconColor: '#10b981',
            iconBgColor: '#d1fae5',
            available: false
        },
        {
            id: 'redis',
            name: 'Redis',
            description: 'In-memory key-value store, ideal for cache and vectors.',
            icon: 'fa-solid fa-circle-dot',
            iconColor: '#ef4444',
            iconBgColor: '#fee2e2',
            available: false
        },
        {
            id: 'snowflake',
            name: 'Snowflake',
            description: 'Cloud data warehouse for large-scale analytics.',
            icon: 'fa-solid fa-snowflake',
            iconColor: '#3b82f6',
            iconBgColor: '#dbeafe',
            available: false
        },
        {
            id: 'bigquery',
            name: 'BigQuery',
            description: 'Google Cloud serverless data warehouse.',
            icon: 'fa-solid fa-cloud',
            iconColor: '#3b82f6',
            iconBgColor: '#e0f2fe',
            available: false
        },
        {
            id: 'amazon-s3',
            name: 'Amazon S3',
            description: 'Object storage for files, exports, and snapshots.',
            icon: 'fa-brands fa-aws',
            iconColor: '#f59e0b',
            iconBgColor: '#fef3c7',
            available: false
        }
    ];

    connections: DatabaseConnection[] = [];
    filteredConnections: DatabaseConnection[] = [];
    connectionSearchQuery = '';
    loading = false;
    showWizard = false;
    testingId: string | null = null;
    deletingId: string | null = null;

    private destroy$ = new Subject<void>();

    constructor(private dbConnectionService: DatabaseConnectionService) { }

    ngOnInit(): void {
        this.loadConnections();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadConnections(): void {
        this.loading = true;
        this.dbConnectionService.list(true).pipe(takeUntil(this.destroy$)).subscribe({
            next: (connections) => {
                this.connections = connections;
                this.applySearch();
                this.loading = false;
            },
            error: () => {
                this.loading = false;
            }
        });
    }

    applySearch(): void {
        const q = this.connectionSearchQuery.trim().toLowerCase();
        if (!q) {
            this.filteredConnections = this.connections;
        } else {
            this.filteredConnections = this.connections.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.host || '').toLowerCase().includes(q) ||
                (c.database_name || '').toLowerCase().includes(q) ||
                (c.schema_name || '').toLowerCase().includes(q)
            );
        }
    }

    onSearchChange(): void {
        this.applySearch();
    }

    onConnectorClick(connector: ConnectorType): void {
        if (connector.available) {
            this.showWizard = true;
        }
    }

    openNewConnection(): void {
        this.showWizard = true;
    }

    onWizardClose(): void {
        this.showWizard = false;
    }

    onWizardSaved(): void {
        this.showWizard = false;
        this.loadConnections();
    }

    deleteConnection(connection: DatabaseConnection, event: MouseEvent): void {
        event.stopPropagation();
        if (!connection.id) return;
        this.deletingId = connection.id;
        this.dbConnectionService.delete(connection.id).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => {
                this.connections = this.connections.filter(c => c.id !== connection.id);
                this.applySearch();
                this.deletingId = null;
            },
            error: () => {
                this.deletingId = null;
            }
        });
    }

    getStatusClass(connection: DatabaseConnection): string {
        const status = (connection.status || '').toLowerCase();
        if (status === 'connected' || status === 'success') return 'status-connected';
        if (status === 'failed' || status === 'error') return 'status-failed';
        return 'status-pending';
    }

    getStatusLabel(connection: DatabaseConnection): string {
        const status = (connection.status || '').toLowerCase();
        if (status === 'connected' || status === 'success') return 'Connected';
        if (status === 'failed' || status === 'error') return 'Failed';
        return 'Pending';
    }

    formatDate(dateStr: string | undefined): string {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}
