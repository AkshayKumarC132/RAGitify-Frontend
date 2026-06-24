import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  UsageAnalyticsService,
  UsageAnalyticsResponse,
  UsageBreakdownRow,
} from '../../../shared/services/usage-analytics.service';

/** One aggregated entry per model across the selected period */
export interface ModelStat {
  model: string;
  color: string;
  response_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

/** One bar in the daily cost chart */
export interface DailyBar {
  date: string;           // ISO date string "YYYY-MM-DD"
  label: string;          // "Jun 22"
  segments: { model: string; cost: number; color: string; heightPct: number }[];
  totalCost: number;
}

/** Palette — extended so up to 10 models get distinct colours */
const MODEL_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#a78bfa',
  '#06b6d4', '#f97316', '#84cc16', '#e11d48', '#14b8a6',
];

const PERIODS: { label: string; value: string }[] = [
  { label: '7d',  value: '7d'  },
  { label: '14d', value: '14d' },
  { label: '30d', value: '30d' },
];

@Component({
  selector: 'app-usage-section',
  templateUrl: './usage-section.component.html',
  styleUrls: ['./usage-section.component.scss'],
})
export class UsageSectionComponent implements OnInit, OnDestroy {
  // ── UI state ────────────────────────────────────────────────────────────
  isLoading  = false;
  hasError   = false;
  activeTab  = 'cost';   // 'cost' | 'activity'
  periods    = PERIODS;
  selectedPeriod = '30d';

  // ── Data ────────────────────────────────────────────────────────────────
  data: UsageAnalyticsResponse | null = null;
  modelStats: ModelStat[]  = [];
  dailyBars:  DailyBar[]   = [];
  modelColorMap: Record<string, string> = {};

  private destroy$ = new Subject<void>();

  constructor(private usageService: UsageAnalyticsService) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Public helpers ───────────────────────────────────────────────────────
  setPeriod(period: string): void {
    if (this.selectedPeriod === period || this.isLoading) return;
    this.selectedPeriod = period;
    this.load();
  }

  refresh(): void { this.load(); }

  // ── Summary computed props ───────────────────────────────────────────────
  get totalCost(): string {
    if (!this.data) return '$0.00';
    return `$${this.data.summary.estimated_cost_usd.toFixed(2)}`;
  }

  get totalTokens(): string {
    if (!this.data) return '0';
    return this.formatTokens(this.data.summary.total_tokens);
  }

  get totalRequests(): string {
    if (!this.data) return '0';
    return this.formatCompact(this.data.summary.response_count);
  }

  get successRate(): string {
    if (!this.data || !this.data.summary.response_count) return '—';
    const pct = (this.data.summary.completed_response_count / this.data.summary.response_count) * 100;
    return `${pct.toFixed(1)}%`;
  }

  get avgLatency(): string {
    const ms = this.data?.summary.avg_retrieval_latency_ms;
    if (ms == null) return '—';
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  private load(): void {
    this.isLoading = true;
    this.hasError  = false;

    this.usageService.getUsage(this.selectedPeriod).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading = false),
    ).subscribe({
      next: (res) => {
        this.data = res;
        this.buildModelColorMap(res.breakdown);
        this.buildModelStats(res.breakdown);
        this.buildDailyBars(res.breakdown);
      },
      error: () => { this.hasError = true; },
    });
  }

  // ── Derived data builders ────────────────────────────────────────────────
  private buildModelColorMap(rows: UsageBreakdownRow[]): void {
    const models = [...new Set(rows.map(r => r.model))].sort();
    this.modelColorMap = {};
    models.forEach((m, i) => {
      this.modelColorMap[m] = MODEL_COLORS[i % MODEL_COLORS.length];
    });
  }

  private buildModelStats(rows: UsageBreakdownRow[]): void {
    const map: Record<string, ModelStat> = {};
    for (const row of rows) {
      if (!map[row.model]) {
        map[row.model] = {
          model: row.model,
          color: this.modelColorMap[row.model] || '#6366f1',
          response_count: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          estimated_cost_usd: 0,
        };
      }
      const s = map[row.model];
      s.response_count     += row.response_count;
      s.prompt_tokens      += row.prompt_tokens;
      s.completion_tokens  += row.completion_tokens;
      s.total_tokens       += row.total_tokens;
      s.estimated_cost_usd += row.estimated_cost_usd;
    }
    this.modelStats = Object.values(map)
      .sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd);
  }

  private buildDailyBars(rows: UsageBreakdownRow[]): void {
    // Group by date
    const byDate: Record<string, { model: string; cost: number; tokens: number; requests: number }[]> = {};
    for (const row of rows) {
      const key = row.date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        model: row.model,
        cost: row.estimated_cost_usd,
        tokens: row.total_tokens,
        requests: row.response_count,
      });
    }

    const dates = Object.keys(byDate).sort();
    const allTotals = dates.map(d => byDate[d].reduce((s, r) => s + r.cost, 0));
    const maxTotal  = Math.max(...allTotals, 0.0001);

    this.dailyBars = dates.map(date => {
      const segments = byDate[date];
      const totalCost = segments.reduce((s, r) => s + r.cost, 0);
      return {
        date,
        label: this.formatDateLabel(date),
        totalCost,
        segments: segments
          .sort((a, b) => b.cost - a.cost)
          .map(s => ({
            model: s.model,
            cost: s.cost,
            color: this.modelColorMap[s.model] || '#6366f1',
            heightPct: totalCost > 0 ? (s.cost / maxTotal) * 100 : 0,
          })),
      };
    });
  }

  /** Y-axis tick values for chart */
  get chartYTicks(): number[] {
    const maxCost = Math.max(...this.dailyBars.map(b => b.totalCost), 0);
    if (maxCost === 0) return [0];
    const step = this.niceStep(maxCost);
    const ticks: number[] = [];
    for (let v = 0; v <= maxCost + step; v += step) {
      ticks.push(parseFloat(v.toFixed(4)));
      if (ticks.length > 6) break;
    }
    return ticks.reverse();
  }

  get chartMaxCost(): number {
    return Math.max(...this.dailyBars.map(b => b.totalCost), 0.0001);
  }

  /** Max bar height pct so bars fill most of the chart area */
  barHeightPct(bar: DailyBar): number {
    return (bar.totalCost / this.chartMaxCost) * 100;
  }

  /** Per-segment height proportional to its share of the bar's total */
  segmentHeightPct(seg: { cost: number }, bar: DailyBar): number {
    if (!bar.totalCost) return 0;
    return (seg.cost / bar.totalCost) * this.barHeightPct(bar);
  }

  // ── Activity tab ─────────────────────────────────────────────────────────
  /** Daily token timeline for activity tab */
  get dailyTokenBars(): { label: string; total: number; pct: number }[] {
    const byDate: Record<string, number> = {};
    for (const row of this.data?.breakdown || []) {
      byDate[row.date] = (byDate[row.date] || 0) + row.total_tokens;
    }
    const dates = Object.keys(byDate).sort();
    const max = Math.max(...Object.values(byDate), 1);
    return dates.map(d => ({
      label: this.formatDateLabel(d),
      total: byDate[d],
      pct: (byDate[d] / max) * 100,
    }));
  }

  /** Daily request counts for activity tab */
  get dailyRequestBars(): { label: string; total: number; pct: number }[] {
    const byDate: Record<string, number> = {};
    for (const row of this.data?.breakdown || []) {
      byDate[row.date] = (byDate[row.date] || 0) + row.response_count;
    }
    const dates = Object.keys(byDate).sort();
    const max = Math.max(...Object.values(byDate), 1);
    return dates.map(d => ({
      label: this.formatDateLabel(d),
      total: byDate[d],
      pct: (byDate[d] / max) * 100,
    }));
  }

  // ── Utility ──────────────────────────────────────────────────────────────
  formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  formatCost(v: number): string {
    return `$${v.toFixed(2)}`;
  }

  /** Largest relative bar for model breakdown */
  maxModelCost(): number {
    return Math.max(...this.modelStats.map(m => m.estimated_cost_usd), 0.0001);
  }

  modelBarPct(m: ModelStat): number {
    return (m.estimated_cost_usd / this.maxModelCost()) * 100;
  }

  get uniqueModels(): string[] {
    return Object.keys(this.modelColorMap);
  }

  private formatDateLabel(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private niceStep(max: number): number {
    const raw = max / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const choices = [1, 2, 5, 10].map(f => f * mag);
    return choices.find(c => c >= raw) || choices[choices.length - 1];
  }
}
