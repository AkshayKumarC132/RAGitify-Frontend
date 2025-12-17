export interface User {
  id: number;
  username?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tenant: number;
  llm_configured?: boolean;
  active_collection_ready?: boolean;
  active_collection?: string | null;
  selected_llm_provider?: SelectedLLMProvider | null;
  is_setup?: boolean;
  language?: string | null;
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
  active_collection: string | null;
  selected_llm_provider: SelectedLLMProvider | null;
}

export interface LlmSetupRequest {
  llm_provider: LlmProviderOption;
  collection_name: string;
}

export type SelectedLLMProvider = 'OpenAI' | 'Ollama';
export type LlmProviderOption = 'openai' | 'ollama';
