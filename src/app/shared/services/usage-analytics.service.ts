import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { HttpParams } from '@angular/common/http';

export interface UsageBreakdownRow {
  date: string;
  model: string;
  response_count: number;
  completed_response_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_confidence: number | null;
  avg_retrieval_latency_ms: number | null;
}

export interface UsageSummary {
  response_count: number;
  completed_response_count: number;
  distinct_models: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_confidence: number | null;
  avg_retrieval_latency_ms: number | null;
}

export interface UsageAnalyticsResponse {
  period: string;
  start_at: string;
  end_at: string;
  summary: UsageSummary;
  breakdown: UsageBreakdownRow[];
}

@Injectable({ providedIn: 'root' })
export class UsageAnalyticsService {
  constructor(private api: ApiService, private auth: AuthService) {}

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) throw new Error('Authentication token is required');
    return token;
  }

  /**
   * Fetch usage analytics for the given period (e.g. "7d", "14d", "30d").
   * Maps to: GET /api/analytics/usage/<token>/?period=<period>
   */
  getUsage(period: string = '30d'): Observable<UsageAnalyticsResponse> {
    const token = this.getToken();
    const params = new HttpParams().set('period', period);
    return this.api.get<UsageAnalyticsResponse>(`/analytics/usage/${token}/`, token, params);
  }
}
