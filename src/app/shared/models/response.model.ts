export interface ResponseRecord {
  id: string;
  conversation: string | null;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  model: string;
  instructions: string;
  input_messages: any[];
  output: ResponseOutput[];
  metadata: Record<string, any>;
  warnings?: string[];
  created_at: string;
  completed_at: string | null;
  error_message?: string;
  has_data_grid?: boolean;
  data_grid_row_count?: number;
}

export interface ResponseCreateRequest {
  conversation?: string;
  model?: string;
  instructions?: string;
  input: ResponseInput[];
  tools?: DocumentTool[];
  db_connection_ids?: string[];
  stream?: boolean;
  metadata?: Record<string, any>;
  web_search?: boolean;
}

export interface ResponseInput {
  role: 'user' | 'assistant';
  content: ResponseContent[] | string;
  metadata?: Record<string, any>;
}

export interface ResponseContent {
  type: 'text' | 'input_text' | 'output_text';
  text: string;
}

export interface ResponseOutput {
  message_id: string | null;
  type: string;
  status: string;
  content: ResponseContent[];
  role: 'assistant';
  metadata?: Record<string, any>;
}

export interface DocumentTool {
  type: 'document';
  vector_store_ids: string[];
  document_ids?: string[];
}

/** Status values for a pipeline task item. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'removed';

/** A single step in the live pipeline task list. */
export interface TaskItem {
  /** Stable identifier for the step (e.g. "retrieve", "synthesize"). */
  id: string;
  /** Human-readable description shown in the UI. */
  label: string;
  /** Current execution status of this step. */
  status: TaskStatus;
}

export interface StreamEvent {
  type: string;
  response?: ResponseRecord;
  delta?: string;
  warnings?: string[];
  /** Present when type === 'task_update' — the full updated task list. */
  tasks?: TaskItem[];
}

