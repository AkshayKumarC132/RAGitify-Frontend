export interface DatabaseConnection {
    id?: string;
    name?: string;
    /** DatabaseConnectionType.id is a UUIDField on the backend, not an int. */
    connection_type_id?: string;
    connection_type?: {
        id: number;
        name: string;
        driver_name: string;
        default_port: number;
    };
    host: string;
    port: number;
    database_name: string;
    username: string;
    password?: string; // write only
    schema_name?: string;
    extra_params?: Record<string, string>;
    allowed_tables?: string[];
    metadata?: Record<string, any>;
    result_limit?: number | null;
    status?: string;
    status_message?: string;
    last_tested_at?: string;
    schema_synced_at?: string;
    created_at?: string;
    updated_at?: string;
    access_type?: 'owned' | 'shared';
    owner_email?: string;
}

export interface FailedConnectionInfo {
    id: string;
    name: string;
    code: string;
    message: string;
    action: string;
}

export interface DatabaseSyncLog {
    id: string;
    connection: string;
    status: 'success' | 'failed';
    error_message?: string;
    started_at: string;
    completed_at?: string;
    duration_ms: number;
    schema_changed: boolean;
    previous_checksum?: string;
    new_checksum?: string;
    tables_added: string[];
    tables_removed: string[];
    schemas_added: string[];
    schemas_removed: string[];
    total_tables: number;
    total_schemas: number;
    created_at: string;
}
