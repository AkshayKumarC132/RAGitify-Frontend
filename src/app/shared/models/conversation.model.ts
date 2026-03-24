export interface Conversation {
  id: string;
  title: string | null;
  is_temporary?: boolean;
  is_pinned?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ConversationCreateRequest {
  title?: string;
  is_temporary?: boolean;
  is_pinned?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}
