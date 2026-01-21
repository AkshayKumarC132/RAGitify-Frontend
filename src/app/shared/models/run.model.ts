export interface Run {
  id: string;
  thread_id: string;
  status: 'queued' | 'in_progress' | 'requires_action' | 'completed' | 'failed' | 'cancelled';
  assistant_id: string;
  mode: 'document' | 'normal' | 'web';
  metadata?: Record<string, any>;
  required_action?: RequiredAction;
  tool_outputs?: ToolOutput[];
  created_at: string;
  completed_at?: string;
  cancelled_at?: string;
  message_id?: number;
  source_run_id?: string;
  source_message_id?: number;
  rerun_of_id?: string;
}

export interface RunCreateRequest {
  thread_id: string;
  assistant_id: string;
  message_id?: number;
  source_run_id?: string;
  tool_outputs?: ToolOutput[];
  mode?: 'document' | 'normal' | 'web';
  queries?: string[];
  filters?: Record<string, any>;
}

export interface RequiredAction {
  type: 'submit_tool_outputs';
  submit_tool_outputs: {
    tool_calls: ToolCall[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolOutput {
  tool_call_id: string;
  output: string;
}

