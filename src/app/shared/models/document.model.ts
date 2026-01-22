export interface Document {
  id: string;
  title: string;
  vector_store: string;
  user: string;
  uploaded_at: string;
  status: 'queued' | 'processing' | 'in_progress' | 'completed' | 'failed';
}

export interface DocumentIngestRequest {
  file?: File;
  s3_file_url?: string;
  vector_store_id: string;
}

export interface DocumentStatus {
  document_id: string;
  status: Document['status'];
  qdrant_points?: number;
}
