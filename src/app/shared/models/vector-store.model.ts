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

export interface VectorStoreStats {
  vector_store_id: string;
  name: string;
  vs_type: VsType | string;
  document_count: number;
  total_file_size: number;
  vector_points: number;
  ingestion_status_breakdown: Record<string, number>;
  file_type_breakdown: Record<string, number>;
}
