export type ConnectionShareStatus = 'success' | 'already_shared' | 'invalid_connection' | 'permission_denied' | 'updated';
export type ConnectionRevokeStatus = 'revoked' | 'not_found' | 'invalid_connection' | 'permission_denied';

export interface ConnectionShareRequest {
  connection_id?: string;
  connection_ids?: string[];
  target_user_id?: number;
  target_user_email?: string;
  expires_at?: string | null;
}

export interface ConnectionShareResult {
  connection_id: string;
  status: ConnectionShareStatus;
  expires_at?: string | null;
}

export interface ConnectionShareResponse {
  target_user_id: number;
  results: ConnectionShareResult[];
  shared_count: number;
}

export interface ConnectionRevokeRequest {
  connection_ids: string[];
  target_user_id?: number;
  target_user_email?: string;
}

export interface ConnectionRevokeResponse {
  results: Array<{
    connection_id: string;
    status: ConnectionRevokeStatus;
  }>;
  revoked_count: number;
}

export interface ConnectionShareRecipientRemoveRequest {
  connection_ids: string[];
}

export interface ConnectionSharedWithMeItem {
  id: number;
  connection_id: string;
  connection_name: string;
  connection_type: string;
  connection_status: string;
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

export type ConnectionSharedByMeItem = ConnectionSharedWithMeItem;
