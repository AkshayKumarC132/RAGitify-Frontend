import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { RevokeRequest, RevokeResponse, ShareRequest, ShareResponse, SharedByMeItem, SharedWithMeItem } from '../models/document-share.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentShareService {
  constructor(
    private api: ApiService,
    private auth: AuthService
  ) {}

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  share(data: ShareRequest): Observable<ShareResponse> {
    const token = this.getToken();
    return this.api.post<ShareResponse>(`/documents/share/${token}/`, data, token);
  }

  revokeByOwner(data: RevokeRequest): Observable<RevokeResponse> {
    const token = this.getToken();
    return this.api.deleteWithBody<RevokeResponse>(`/documents/share/${token}/`, data, token);
  }

  listSharedWithMe(): Observable<SharedWithMeItem[]> {
    const token = this.getToken();
    return this.api.get<SharedWithMeItem[]>(`/documents/shared-with-me/${token}/`, token);
  }

  revokeSharedWithMe(documentIds: string[]): Observable<RevokeResponse> {
    const token = this.getToken();
    return this.api.deleteWithBody<RevokeResponse>(`/documents/shared-with-me/${token}/`, { document_ids: documentIds }, token);
  }

  listSharedByMe(): Observable<SharedByMeItem[]> {
    const token = this.getToken();
    return this.api.get<SharedByMeItem[]>(`/documents/shared-by-me/${token}/`, token);
  }
}
