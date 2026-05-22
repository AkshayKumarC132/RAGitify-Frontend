export type DocumentSource = 'LOCAL' | 'S3';
export type IngestionStatus = 'queued' | 'processing' | 'in_progress' | 'completed' | 'failed';
export type AccessType = 'ingested' | 'shared';

export interface Document {
  id: string;
  title: string;
  vector_store: string;
  user?: string;
  uploaded_at: string;
  status: IngestionStatus;
  original_filename?: string;
  file_size?: number;
  file_type?: string;
  checksum?: string;
  source?: DocumentSource;
  s3_url?: string;
  s3_key?: string;
  signed_url?: string;
  uploaded_by?: number;
  tenant?: number;
  access_type?: AccessType;
  ingestion_status?: IngestionStatus;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentIngestRequest {
  files?: File[];
  s3_file_url?: string;
  vector_store_id?: string;
}

export interface DocumentStatus {
  document_id: string;
  status: IngestionStatus;
  qdrant_points?: number;
}

export interface DocumentPreview {
  id: string;
  title: string;
  file_type: string;
  file_size: number | null;
  status: IngestionStatus;
  uploaded_at: string | null;
  summary_available: boolean;
  snippet: string;
  truncated: boolean;
  keywords: string[];
}

export interface IngestResponse {
  message: string;
  file_name: string;
  document_id: string;
  vector_store_id: string;
  status: IngestionStatus;
}

export interface DocumentMoveRequest {
  document_ids: string[];
  target_vector_store_id: string;
}

export interface DocumentMoveResponse {
  message: string;
  document_ids: string[];
  from_vector_store: string | string[];
  to_vector_store: string;
}
