export interface Message {
  id: number;
  thread_id: string;
  user: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface MessageCreateRequest {
  thread_id: string;
  content: string;
}

