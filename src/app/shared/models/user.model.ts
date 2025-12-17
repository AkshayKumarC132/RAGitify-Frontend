export interface User {
  id: number;
  username?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tenant: number;
  llm_configured?: boolean;
  active_collection_ready?: boolean; // legacy naming from older responses
  collection_ready?: boolean; // newer naming from backend
  active_collection?: ActiveCollection | null;
  selected_llm_provider?: SelectedLLMProvider | null; // legacy naming from older responses
  active_provider?: SelectedLLMProvider | null; // newer naming from backend
  is_setup?: boolean;
  language?: string | null;
  ready?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  tenant_name: string;
  collection_name?: string;
  llm_provider?: LlmProviderOption;
  language?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UserStatus {
  llm_configured: boolean;
  active_collection_ready: boolean;
  active_collection: ActiveCollection | null;
  selected_llm_provider: SelectedLLMProvider | null;
  ready: boolean;
}

export interface LlmSetupRequest {
  llm_provider: LlmProviderOption;
  collection_name: string;
}

export interface ActiveCollection {
  id: string;
  name?: string;
  qdrant_collection_name?: string;
  embedding_dimension?: number;
  provider?: SelectedLLMProvider | null;
}

export type SelectedLLMProvider = 'OpenAI' | 'Ollama';
export type LlmProviderOption = 'openai' | 'ollama';
