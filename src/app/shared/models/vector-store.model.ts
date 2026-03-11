export type VsType = 'DEFAULT' | 'SHARED' | 'CUSTOM';

export interface VectorStore {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  user: string | number;
  collection?: string;
  vs_type?: VsType;
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}

export interface VectorStoreCreateRequest {
  name: string;
  metadata?: Record<string, unknown>;
}

