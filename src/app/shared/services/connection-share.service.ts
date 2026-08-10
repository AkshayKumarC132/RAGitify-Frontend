import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  ConnectionShareRequest,
  ConnectionShareResponse,
  ConnectionRevokeRequest,
  ConnectionRevokeResponse,
  ConnectionSharedWithMeItem,
  ConnectionSharedByMeItem,
  ConnectionShareRecipientRemoveRequest
} from '../models/connection-share.model';
import { DatabaseConnection } from '../models/database-connection.model';

@Injectable({
  providedIn: 'root'
})
export class ConnectionShareService {
  private get baseUrl() {
    return environment.apiUrl;
  }

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getToken(): string {
    return this.authService.getToken() || '';
  }

  /**
   * Share connections with another user.
   */
  share(payload: ConnectionShareRequest): Observable<ConnectionShareResponse> {
    const token = this.getToken();
    return this.http.post<ConnectionShareResponse>(`${this.baseUrl}/connections/share/${token}/`, payload);
  }

  /**
   * Revoke shared connections.
   */
  revoke(payload: ConnectionRevokeRequest): Observable<ConnectionRevokeResponse> {
    const token = this.getToken();
    // In Django Rest Framework, DELETE requests can have a body if supported by the client,
    // Angular's HttpClient delete() supports a body via the `options.body` parameter.
    return this.http.delete<ConnectionRevokeResponse>(`${this.baseUrl}/connections/share/${token}/`, { body: payload });
  }

  /**
   * List connections shared with the current user.
   */
  listSharedWithMe(): Observable<ConnectionSharedWithMeItem[]> {
    const token = this.getToken();
    return this.http.get<ConnectionSharedWithMeItem[]>(`${this.baseUrl}/connections/shared-with-me/${token}/`);
  }

  /**
   * Remove a connection shared with the current user from their list.
   */
  removeSharedWithMe(payload: ConnectionShareRecipientRemoveRequest): Observable<ConnectionRevokeResponse> {
    const token = this.getToken();
    return this.http.delete<ConnectionRevokeResponse>(`${this.baseUrl}/connections/shared-with-me/${token}/`, { body: payload });
  }

  /**
   * List connections shared by the current user.
   */
  listSharedByMe(): Observable<ConnectionSharedByMeItem[]> {
    const token = this.getToken();
    return this.http.get<ConnectionSharedByMeItem[]>(`${this.baseUrl}/connections/shared-by-me/${token}/`);
  }

  /**
   * Maps shared-with-me items to DatabaseConnection objects
   * for display alongside owned connections.
   */
  static mapToDatabaseConnections(items: ConnectionSharedWithMeItem[]): DatabaseConnection[] {
    return items.map(item => ({
      id: item.connection_id,
      name: item.connection_name,
      connection_type: {
        id: 0,
        name: item.connection_type,
        driver_name: item.connection_type,
        default_port: 0
      },
      host: '',
      port: 0,
      database_name: '',
      username: '',
      status: item.connection_status,
      access_type: 'shared' as const,
      owner_email: item.owner_email,
      created_at: item.shared_at,
      updated_at: item.updated_at
    }));
  }
}
