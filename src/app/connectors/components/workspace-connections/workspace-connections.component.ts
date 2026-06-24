import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

export interface ConnectorType {
    id: string;
    name: string;
    description: string;
    icon: string;
    iconImg?: string;
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
            icon: '',
            iconImg: 'assets/postgres.svg',
            iconColor: '#3b82f6',
            iconBgColor: '#e0e9ff',
            available: true
        },
        {
            id: 'clickhouse',
            name: 'ClickHouse',
            description: 'Column-oriented OLAP database for real-time analytics.',
            icon: '',
            iconImg: 'assets/clickhouse.svg',
            iconColor: '#f59e0b',
            iconBgColor: '#fef3c7',
            available: true
        },
        {
            id: 'mysql',
            name: 'MySQL',
            description: 'Popular open-source relational database.',
            icon: '',
            iconImg: 'assets/mysql.svg',
            iconColor: '#00758F',
            iconBgColor: '#e8f4f8',
            available: false
        },
        {
            id: 'mongodb',
            name: 'MongoDB',
            description: 'Document-oriented NoSQL database.',
            icon: '',
            iconImg: 'assets/mongodb.svg',
            iconColor: '#10b981',
            iconBgColor: '#d1fae5',
            available: false
        },
        {
            id: 'redis',
            name: 'Redis',
            description: 'In-memory key-value store, ideal for cache and vectors.',
            icon: '',
            iconImg: 'assets/redis.svg',
            iconColor: '#ef4444',
            iconBgColor: '#fee2e2',
            available: false
        },
        {
            id: 'snowflake',
            name: 'Snowflake',
            description: 'Cloud data warehouse for large-scale analytics.',
            icon: '',
            iconImg: 'assets/snowflake.svg',
            iconColor: '#29B5E8',
            iconBgColor: '#e0f6fd',
            available: false
        },
        {
            id: 'bigquery',
            name: 'BigQuery',
            description: 'Google Cloud serverless data warehouse.',
            icon: '',
            iconImg: 'assets/bigquery.svg',
            iconColor: '#4285F4',
            iconBgColor: '#e8f0fe',
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
    viewMode: 'list' | 'grid' = 'list';
    loading = false;
    testingId: string | null = null;
    deletingId: string | null = null;

    private destroy$ = new Subject<void>();

    constructor(
        private dbConnectionService: DatabaseConnectionService, 
        private router: Router,
        private confirmDialogService: ConfirmDialogService
    ) { }

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
            if (connector.id === 'postgresql') {
                this.router.navigate(['/connectors/new/postgres']);
            } else if (connector.id === 'clickhouse') {
                this.router.navigate(['/connectors/new/clickhouse']);
            }
        }
    }

    openNewConnection(): void {
        const postgresConnector = this.connectorTypes.find(c => c.id === 'postgresql');
        if (postgresConnector && postgresConnector.available) {
            this.router.navigate(['/connectors/new/postgres']);
        }
    }

    viewConnectionDetails(id: string | undefined): void {
        if (id) {
            this.router.navigate(['/connectors', id]);
        }
    }

    async deleteConnection(connection: DatabaseConnection, event: MouseEvent): Promise<void> {
        event.stopPropagation();
        if (!connection.id) return;

        const confirmed = await this.confirmDialogService.confirm({
            title: 'Delete Connection',
            message: `Are you sure you want to delete this connection?`,
            itemName: connection.name || connection.database_name || 'Connection',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });

        if (!confirmed) return;

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

    getDatabaseIcon(conn: DatabaseConnection): string {
        const typeName = (conn.connection_type?.driver_name || conn.connection_type?.name || '').toLowerCase();
        
        if (typeName.includes('postgres')) return 'assets/postgres.svg';
        if (typeName.includes('clickhouse')) return 'assets/clickhouse.svg';
        if (typeName.includes('mysql')) return 'assets/mysql.svg';
        if (typeName.includes('mongodb')) return 'assets/mongodb.svg';
        if (typeName.includes('redis')) return 'assets/redis.svg';
        if (typeName.includes('snowflake')) return 'assets/snowflake.svg';
        if (typeName.includes('bigquery')) return 'assets/bigquery.svg';
        
        return 'assets/postgres.svg'; // fallback
    }

    getDatabaseBgColor(conn: DatabaseConnection): string {
        const typeName = (conn.connection_type?.driver_name || conn.connection_type?.name || '').toLowerCase();
        
        if (typeName.includes('postgres')) return '#e0e9ff';
        if (typeName.includes('clickhouse')) return '#fef3c7';
        if (typeName.includes('mysql')) return '#e8f4f8';
        if (typeName.includes('mongodb')) return '#d1fae5';
        if (typeName.includes('redis')) return '#fee2e2';
        if (typeName.includes('snowflake')) return '#e0f6fd';
        if (typeName.includes('bigquery')) return '#e8f0fe';
        
        return '#e0e9ff'; // fallback
    }
}
