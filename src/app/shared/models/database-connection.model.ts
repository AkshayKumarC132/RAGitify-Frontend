export interface DatabaseConnection {
    id?: string;
    name?: string;
    connection_type_id?: number;
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
}
