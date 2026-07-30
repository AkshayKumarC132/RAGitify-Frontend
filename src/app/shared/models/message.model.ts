export interface Message {
  id: number;
  thread_id: string;
  user: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
  has_data_grid?: boolean;
  data_grid_id?: number;
  data_grid_row_count?: number;
}

export interface MessageCreateRequest {
  thread_id: string;
  content: string;
}

