export type ShareStatus = 'success' | 'already_shared' | 'invalid_document' | 'permission_denied';
export type RevokeStatus = 'revoked' | 'not_found' | 'invalid_document' | 'permission_denied';

export interface ShareRequest {
  document_id?: string;
  document_ids?: string[];
  target_user_id?: number;
  target_user_email?: string;
  expires_at?: string | null;
}

export interface ShareResult {
  document_id: string;
  status: ShareStatus;
}

export interface ShareResponse {
  target_user_id: number;
  results: ShareResult[];
  shared_count: number;
}

export interface RevokeRequest {
  document_ids: string[];
  target_user_id?: number;
  target_user_email?: string;
}

export interface RevokeResponse {
  results: Array<{
    document_id: string;
    status: RevokeStatus;
  }>;
  revoked_count: number;
}

export interface SharedWithMeItem {
  id: string;
  document_id: string;
  document_title: string;
  owner_id: number;
  owner_email: string;
  recipient_id: number;
  recipient_email: string;
  is_active: boolean;
  active: boolean;
  shared_at: string;
  revoked_at: string | null;
  expires_at: string | null;
  updated_at: string;
}

export type SharedByMeItem = SharedWithMeItem;
