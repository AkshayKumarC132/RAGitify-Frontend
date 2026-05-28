import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { DatabaseConnection } from '../models/database-connection.model';

@Injectable({
    providedIn: 'root'
})
export class DatabaseConnectionService {
    private listCache$?: Observable<DatabaseConnection[]>;
    private cachedForUserId: number | null = null;

    constructor(
        private api: ApiService,
        private auth: AuthService,
        private userState: UserStateService
    ) {
        this.userState.registerResetFn(() => this.invalidateListCache());
    }

    private getToken(): string {
        const token = this.auth.getToken();
        if (!token) {
            throw new Error('Authentication token is required');
        }
        return token;
    }

    create(data: Partial<DatabaseConnection>): Observable<DatabaseConnection> {
        const token = this.getToken();
        return this.api.post<DatabaseConnection>(`/database-connections/${token}/`, data, token).pipe(
            tap(() => this.invalidateListCache())
        );
    }

    list(forceRefresh = false): Observable<DatabaseConnection[]> {
        const token = this.getToken();
        if (forceRefresh) {
            this.invalidateListCache();
        }
        if (this.listCache$ && !this.userState.isCurrentUser(this.cachedForUserId)) {
            this.invalidateListCache();
        }
        if (!this.listCache$) {
            this.cachedForUserId = this.userState.currentUserId;
            this.listCache$ = this.api.get<DatabaseConnection[]>(`/database-connections/${token}/`, token).pipe(
                shareReplay({ bufferSize: 1, refCount: true })
            );
        }
        return this.listCache$;
    }

    getById(id: string): Observable<DatabaseConnection> {
        const token = this.getToken();
        return this.api.get<DatabaseConnection>(`/database-connections/${token}/${id}/`, token);
    }

    update(id: string, data: Partial<DatabaseConnection>): Observable<DatabaseConnection> {
        const token = this.getToken();
        return this.api.patch<DatabaseConnection>(`/database-connections/${token}/${id}/`, data, token).pipe(
            tap(() => this.invalidateListCache())
        );
    }

    delete(id: string): Observable<void> {
        const token = this.getToken();
        return this.api.delete<void>(`/database-connections/${token}/${id}/`, token).pipe(
            tap(() => this.invalidateListCache())
        );
    }

    getConnectionTypes(): Observable<any[]> {
        const token = this.getToken();
        return this.api.get<any[]>(`/database-connection-types/${token}/list/`, token);
    }

    fetchSchemas(data: any): Observable<{ success: boolean, message: string, schemas: string[] }> {
        const token = this.getToken();
        return this.api.post<{ success: boolean, message: string, schemas: string[] }>(`/database-connections/${token}/fetch-schemas/`, data, token);
    }

    testConnection(id: string): Observable<{ success: boolean, message: string }> {
        const token = this.getToken();
        return this.api.post<{ success: boolean, message: string }>(`/database-connections/${token}/${id}/test/`, {}, token);
    }

    invalidateListCache(): void {
        this.listCache$ = undefined;
        this.cachedForUserId = null;
    }
}
