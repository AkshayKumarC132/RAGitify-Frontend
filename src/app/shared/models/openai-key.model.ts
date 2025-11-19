export interface OpenAIKey {
  id: number;
  api_key?: string;
  name?: string;
  model: string;
  provider: 'OpenAI' | 'Ollama' | 'Claude';
  is_valid: boolean;
  is_active: boolean;
}

export interface OpenAIKeyCreateRequest {
  api_key?: string;
  name?: string;
  model?: string;
  provider: 'OpenAI' | 'Ollama' | 'Claude';
  is_active?: boolean;
}

