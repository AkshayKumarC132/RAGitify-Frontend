import { Injectable } from '@angular/core';
import { Observable, timer, of } from 'rxjs';
import { exhaustMap, takeWhile, catchError, filter } from 'rxjs/operators';
import { HttpParams, HttpContext } from '@angular/common/http';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';
import { Run, RunCreateRequest } from '../models/run.model';

@Injectable({
  providedIn: 'root'
})
export class RunService {
  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  create(data: RunCreateRequest): Observable<Run> {
    const token = this.getToken();
    return this.api.post<Run>(`/run/${token}/`, data, token);
  }

  list(threadId?: string): Observable<Run[]> {
    const token = this.getToken();
    let params = new HttpParams();
    if (threadId) {
      params = params.set('thread_id', threadId);
    }
    return this.api.get<Run[]>(`/run/${token}/list/`, token, params);
  }

  getById(id: string, skipLoading: boolean = false): Observable<Run> {
    const token = this.getToken();
    const context = new HttpContext().set(SKIP_LOADING, skipLoading);
    return this.api.get<Run>(`/run/${token}/${id}/`, token, undefined, context);
  }

  cancel(runId: string): Observable<any> {
    const token = this.getToken();
    return this.api.post(`/run/${token}/${runId}/cancel/`, {}, token);
  }

  rerun(runId: string, data?: Partial<RunCreateRequest>): Observable<Run> {
    const token = this.getToken();
    return this.api.post<Run>(`/run/${token}/${runId}/rerun/`, data || {}, token);
  }

  submitToolOutputs(runId: string, toolOutputs: any[]): Observable<Run> {
    const token = this.getToken();
    return this.api.post<Run>(`/run/${token}/${runId}/submit-tool-outputs/`, { tool_outputs: toolOutputs }, token);
  }

  pollRunStatus(runId: string, intervalMs: number = 2000): Observable<Run> {
    return timer(0, intervalMs).pipe(
      exhaustMap(() =>
        this.getById(runId, true).pipe(
          catchError(err => {
            console.error('Error polling run status:', err);
            return of(null as any);
          })
        )
      ),
      filter((run): run is Run => !!run),
      takeWhile((run: Run) =>
        run.status === 'queued' ||
        run.status === 'in_progress' ||
        run.status === 'requires_action',
        true
      ),
      catchError(err => {
        console.error('Error polling run status:', err);
        return of(null as any);
      })
    );
  }
}
