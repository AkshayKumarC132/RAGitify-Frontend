/** A single attachment item in the unified context rail */
export interface ContextItem {
  type: 'file' | 'database';
  id: string;
  name: string;
  /** e.g. 'postgres', 'clickhouse', 'xlsx', 'csv', 'pdf' */
  subType?: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  is_temporary?: boolean;
  is_pinned?: boolean;
  enable_data_grid?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ConversationCreateRequest {
  title?: string;
  is_temporary?: boolean;
  is_pinned?: boolean;
  enable_data_grid?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
  has_data_grid?: boolean;
  data_grid_id?: number;
  data_grid_row_count?: number;
  /** Token counts from the linked ResponseRecord — only present on assistant messages */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

/** A single parsed source grid ready for display */
export interface DataGridSource {
  grid_id: string;
  source_key: string;    // e.g. "spreadsheet:doc_xxx" or "database:xxx"
  source_name: string;   // human-readable label e.g. "2019-2023 PLACEMENT REPORT.xlsx"
  rows: Record<string, any>[];
  columns: string[];     // derived from Object.keys(rows[0])
}

/** Shape of the /data-grid/ API response */
export interface DataGridResponse {
  id: number;
  message: number;
  row_count: number;
  created_at: string;
  data: Array<{
    grid_id: string;
    source_key: string;
    source_name: string;
    rows: Record<string, any>[];
  }>;
  sql_query: Record<string, string> | null;
}

export interface AttachedDataGrid {
  id: number;
  name: string;
  row_count?: number;
  columns?: string[];
}
