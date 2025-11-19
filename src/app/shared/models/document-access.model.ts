export interface DocumentAccess {
  id: number;
  document: number;
  vector_store: string;
  granted_by: number;
  granted_at: string;
  updated_at: string;
}

export interface DocumentAccessCreateRequest {
  document_ids: string[];
  vector_store_id: string;
}

