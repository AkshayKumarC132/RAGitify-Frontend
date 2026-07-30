import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';
import { AuthService } from '../../../shared/services/auth.service';

@Component({
    selector: 'app-connectors-layout',
    templateUrl: './connectors-layout.component.html',
    styleUrls: ['./connectors-layout.component.scss']
})
export class ConnectorsLayoutComponent implements OnInit, OnDestroy {
    sidebarCollapsed = false;
    hoveringExpandControl = false;
    private brandExpandInteraction = false;
    private toggleExpandInteraction = false;

    isDetailRoute = false;
    isNewRoute = false;
    connections: DatabaseConnection[] = [];
    filteredConnections: DatabaseConnection[] = [];
    connectionSearch = '';
    loadingConnections = false;
    activeConnectionId: string | null = null;

    private destroy$ = new Subject<void>();

    constructor(
        private router: Router,
        private dbConnectionService: DatabaseConnectionService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.checkRoute(this.router.url);
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            takeUntil(this.destroy$)
        ).subscribe((e: any) => {
            this.checkRoute(e.url);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private checkRoute(url: string): void {
        this.isNewRoute = url.includes('/connectors/new');
        
        // matches /connectors/<some-id> (but not /connectors or /connectors/new...)
        const match = url.match(/^\/connectors\/(?!new)([^/]+)/);
        if (match) {
            this.isDetailRoute = true;
            this.activeConnectionId = match[1];
            if (!this.connections.length) {
                this.loadConnections();
            }
        } else {
            this.isDetailRoute = false;
            this.activeConnectionId = null;
        }
    }

    loadConnections(): void {
        this.loadingConnections = true;
        this.dbConnectionService.list(true).pipe(takeUntil(this.destroy$)).subscribe({
            next: (connections) => {
                this.connections = connections;
                this.applySearch();
                this.loadingConnections = false;
            },
            error: () => { this.loadingConnections = false; }
        });
    }

    applySearch(): void {
        const q = this.connectionSearch.trim().toLowerCase();
        this.filteredConnections = q
            ? this.connections.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.database_name || '').toLowerCase().includes(q)
            )
            : this.connections;
    }

    navigateToConnection(id: string | undefined): void {
        if (id) this.router.navigate(['/connectors', id]);
    }

    goToConnectorsList(): void {
        this.router.navigate(['/connectors']);
    }

    goToNewChat(): void {
        this.router.navigate(['/home']);
    }

    goToHome(): void {
        this.router.navigate(['/home']);
    }

    goToWorkspace(): void {
        this.router.navigate(['/workspace']);
    }

    onBrandClick(): void {
        if (this.sidebarCollapsed) return;
        this.goToNewChat();
    }

    toggleSidebar(forceState?: boolean, event?: MouseEvent): void {
        event?.stopPropagation();
        const nextState = typeof forceState === 'boolean' ? forceState : !this.sidebarCollapsed;
        if (nextState !== this.sidebarCollapsed) {
            this.sidebarCollapsed = nextState;
            if (!nextState) this.resetExpandControlState();
        }
    }

    handleBrandExpandInteraction(active: boolean): void {
        this.brandExpandInteraction = active;
        this.updateExpandControlState();
    }

    handleToggleExpandInteraction(active: boolean): void {
        this.toggleExpandInteraction = active;
        this.updateExpandControlState();
    }

    private updateExpandControlState(): void {
        if (!this.sidebarCollapsed) {
            this.resetExpandControlState();
            return;
        }
        this.hoveringExpandControl = this.brandExpandInteraction || this.toggleExpandInteraction;
    }

    private resetExpandControlState(): void {
        this.brandExpandInteraction = false;
        this.toggleExpandInteraction = false;
        this.hoveringExpandControl = false;
    }

    getStatusClass(connection: DatabaseConnection): string {
        const s = (connection.status || '').toLowerCase();
        if (s === 'connected' || s === 'success') return 'status-dot connected';
        if (s === 'failed' || s === 'error') return 'status-dot failed';
        return 'status-dot pending';
    }

    getDatabaseIcon(conn: DatabaseConnection): string {
        const typeName = (
            conn.connection_type?.driver_name ||
            conn.connection_type?.name ||
            conn.metadata?.['connection_type'] ||
            conn.metadata?.['type'] ||
            (conn.port === 8123 || conn.port === 9000 ? 'clickhouse' : '')
        ).toString().toLowerCase();

        if (typeName.includes('postgres')) return 'assets/postgres.svg';
        if (typeName.includes('clickhouse')) return 'assets/clickhouse.svg';
        if (typeName.includes('mysql')) return 'assets/mysql.svg';
        if (typeName.includes('mongodb')) return 'assets/mongodb.svg';
        if (typeName.includes('redis')) return 'assets/redis.svg';
        if (typeName.includes('snowflake')) return 'assets/snowflake.svg';
        if (typeName.includes('bigquery')) return 'assets/bigquery.svg';

        return 'assets/postgres.svg'; // fallback
    }

    getDatabaseTypeName(conn: DatabaseConnection): string {
        const typeName = (
            conn.connection_type?.driver_name ||
            conn.connection_type?.name ||
            conn.metadata?.['connection_type'] ||
            conn.metadata?.['type'] ||
            (conn.port === 8123 || conn.port === 9000 ? 'clickhouse' : '')
        ).toString().toLowerCase();

        if (typeName.includes('postgres')) return 'PostgreSQL';
        if (typeName.includes('clickhouse')) return 'ClickHouse';
        if (typeName.includes('mysql')) return 'MySQL';
        if (typeName.includes('mongodb')) return 'MongoDB';
        if (typeName.includes('redis')) return 'Redis';
        if (typeName.includes('snowflake')) return 'Snowflake';
        if (typeName.includes('bigquery')) return 'BigQuery';

        return conn.connection_type?.name || 'Database';
    }

    logout(): void {
        const token = this.authService.getToken();
        if (token) {
            this.authService.logout(token).subscribe({
                next: () => {
                    this.authService.clearAuth();
                    this.router.navigate(['/auth/login']);
                },
                error: () => {
                    this.authService.clearAuth();
                    this.router.navigate(['/auth/login']);
                }
            });
        } else {
            this.authService.clearAuth();
            this.router.navigate(['/auth/login']);
        }
    }
}

