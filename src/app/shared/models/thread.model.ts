export interface Thread {
  id: string;
  title: string | null;
  created_at: string;
  vector_store_id_read: string | null;
}

export interface ThreadCreateRequest {
  vector_store_id?: string;
  title?: string;
}

