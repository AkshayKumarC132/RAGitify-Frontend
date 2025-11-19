export interface Assistant {
  id: string;
  name: string;
  vector_store_id?: string;
  instructions?: string;
  model?: string;
  tools?: Tool[];
  created_at: string;
  updated_at: string;
}

export interface AssistantCreateRequest {
  name: string;
  vector_store_id?: string;
  instructions?: string;
  model?: string;
  tools?: Tool[];
}

export interface Tool {
  type: 'function' | 'file_search';
  function?: FunctionTool;
  file_search?: FileSearchTool;
}

export interface FunctionTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, PropertyDefinition>;
    required?: string[];
  };
  strict?: boolean;
}

export interface PropertyDefinition {
  type: string;
  description: string;
  enum?: string[];
}

export interface FileSearchTool {
  ranking_options?: {
    ranker?: string;
    score_threshold?: number;
  };
}

