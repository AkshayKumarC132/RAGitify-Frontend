export interface VectorStore {
  id: string;
  name: string;
  user: string;
  created_at: string;
}

export interface VectorStoreCreateRequest {
  name: string;
}

