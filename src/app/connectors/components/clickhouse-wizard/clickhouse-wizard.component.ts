import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseConnectionService } from '../../../shared/services/database-connection.service';

@Component({
    selector: 'app-clickhouse-wizard',
    templateUrl: './clickhouse-wizard.component.html',
    styleUrls: ['./clickhouse-wizard.component.scss']
})
export class ClickhouseWizardComponent implements OnInit {

    // -----------------------------------------------------------------------
    // UI state
    // -----------------------------------------------------------------------
    step: 1 | 2 = 1;
    loading = false;
    showPassword = false;

    /** Error shown on Step 1 (fetch-databases failure) */
    testError: string | null = null;
    /** Error shown on Step 2 (create connection failure) */
    saveError: string | null = null;

    // -----------------------------------------------------------------------
    // Form fields (collected on Step 1, sent to /create on Step 2)
    // -----------------------------------------------------------------------
    connectionDetails = {
        name: '',
        host: '',
        port: 8443,
        database_name: '',
        username: '',
        password: '',
        result_limit: 1000 as number | null
    };

    fetchLimits: (number | null)[] = [500, 1000, 5000, 10000, null];

    // -----------------------------------------------------------------------
    // Database picker (populated on Step 2 from /fetch-schemas response)
    // -----------------------------------------------------------------------
    availableSchemas: string[] = [];
    selectedSchema = 'default';

    private clickhouseTypeId: number | null = null;

    constructor(private dbConnectionService: DatabaseConnectionService, private router: Router) { }

    ngOnInit(): void {
        this.dbConnectionService.getConnectionTypes().subscribe({
            next: (types) => {
                const chType = types.find(
                    (t: any) =>
                        t.driver_name?.toLowerCase().includes('clickhouse') ||
                        t.name?.toLowerCase().includes('clickhouse')
                );
                if (chType) {
                    this.clickhouseTypeId = chType.id;
                }
            },
            error: (err) => console.error('Failed to load connection types:', err)
        });
    }

    // -----------------------------------------------------------------------
    // Step 1 validation
    // -----------------------------------------------------------------------
    isStep1Valid(): boolean {
        return !!(
            this.connectionDetails.name &&
            this.connectionDetails.host &&
            this.connectionDetails.port &&
            this.connectionDetails.username &&
            this.connectionDetails.password
        );
    }

    // -----------------------------------------------------------------------
    // Step 1 action: Test connectivity and fetch available databases
    // -----------------------------------------------------------------------
    onFetchSchemas(): void {
        if (!this.isStep1Valid() || this.loading) return;

        if (!this.clickhouseTypeId) {
            this.testError =
                'ClickHouse connection type not loaded yet. Please try again in a moment or refresh the page.';
            return;
        }

        this.loading = true;
        this.testError = null;
        this.availableSchemas = [];
        this.selectedSchema = 'default';

        this.dbConnectionService
            .fetchSchemas({
                host: this.connectionDetails.host,
                port: Number(this.connectionDetails.port),
                username: this.connectionDetails.username,
                password: this.connectionDetails.password,
                connection_type_id: this.clickhouseTypeId
            })
            .subscribe({
                next: (res) => {
                    this.loading = false;
                    if (res.success && res.schemas?.length) {
                        this.availableSchemas = res.schemas;
                        // Pre-select "default" if present, otherwise first schema
                        this.selectedSchema =
                            res.schemas.includes('default') ? 'default' : res.schemas[0];
                        this.step = 2;
                    } else if (res.success && !res.schemas?.length) {
                        // Connected but no schemas — still advance with a default
                        this.availableSchemas = ['default'];
                        this.selectedSchema = 'default';
                        this.step = 2;
                    } else {
                        this.testError =
                            res.message || 'Could not fetch databases. Check your credentials.';
                    }
                },
                error: (err) => {
                    this.loading = false;
                    this.testError =
                        err?.error?.message ||
                        err?.error?.detail ||
                        err?.message ||
                        'Connection failed. Please check your credentials.';
                }
            });
    }

    // -----------------------------------------------------------------------
    // Step 2 action: Create the connection record (with selected schema)
    // -----------------------------------------------------------------------
    isSaveValid(): boolean {
        return !!(this.selectedSchema && this.selectedSchema.trim());
    }

    onSaveConnection(): void {
        if (!this.isSaveValid() || this.loading || !this.clickhouseTypeId) return;

        this.loading = true;
        this.saveError = null;

        const payload = {
            name: this.connectionDetails.name,
            connection_type_id: this.clickhouseTypeId,
            host: this.connectionDetails.host,
            port: Number(this.connectionDetails.port),
            username: this.connectionDetails.username,
            password: this.connectionDetails.password,
            database_name: this.selectedSchema,
            schema_name: this.selectedSchema,
            result_limit: this.connectionDetails.result_limit
        };

        this.dbConnectionService.create(payload).subscribe({
            next: (created) => {
                this.loading = false;
                this.router.navigate(['/connectors']);
            },
            error: (err) => {
                this.loading = false;
                this.saveError =
                    err?.error?.detail ||
                    err?.error?.message ||
                    err?.message ||
                    'Failed to save the connection. Please try again.';
            }
        });
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    togglePasswordVisibility(): void {
        this.showPassword = !this.showPassword;
    }

    onCancel(): void {
        if (!this.loading) {
            this.router.navigate(['/connectors']);
        }
    }

    getLimitLabel(limit: number | null): string {
        if (limit === null) return 'No limit';
        return limit === 1000 ? '1,000 (Default)' : limit.toLocaleString();
    }
}
