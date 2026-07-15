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
  avg_latency_ms: number | null;
}

export interface ModelStatInternal extends ModelStat {
  _latencySum: number;
  _latencyCount: number;
}

export interface DailyBar {
  date: string;           // ISO date string "YYYY-MM-DD"
  label: string;          // "Jun 22"
  segments: { model: string; value: number; color: string; heightPct: number }[];
  totalValue: number;
}

/** Palette — extended so up to 10 models get distinct colours */
const MODEL_COLORS = [
  '#1e40af', '#3b82f6', '#6366f1', '#93c5fd', '#bfdbfe',
  '#60a5fa', '#818cf8', '#a5b4fc', '#7dd3fc', '#c4b5fd',
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
  modelColorMap: Record<string, string> = {};

  dailyCostBars: DailyBar[] = [];
  costYTicks: number[] = [];
  maxCost: number = 0;

  dailyTokenBars: DailyBar[] = [];
  tokenYTicks: number[] = [];
  maxTokens: number = 0;

  dailyRequestBars: DailyBar[] = [];
  requestYTicks: number[] = [];
  maxRequests: number = 0;

  // ── Tooltip state ────────────────────────────────────────────────────────
  hoveredChartType: 'cost' | 'tokens' | 'requests' | null = null;
  hoveredBarIndex: number | null = null;
  tooltipX: number = 0;
  tooltipY: number = 0;

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
    return this.formatCost(this.data.summary.estimated_cost_usd);
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
    return this.formatLatency(ms);
  }

  // ── Totals for the table footer ──────────────────────────────────────────
  get summaryTotals(): { requests: number; input: number; output: number; total: number; cost: number } {
    if (!this.data || !this.data.summary) {
      return { requests: 0, input: 0, output: 0, total: 0, cost: 0 };
    }
    const s = this.data.summary;
    return {
      requests: s.response_count,
      input: s.prompt_tokens,
      output: s.completion_tokens,
      total: s.total_tokens,
      cost: s.estimated_cost_usd
    };
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

        // Build the three charts
        const costData = this.buildBars(res.breakdown, r => r.estimated_cost_usd, true);
        this.dailyCostBars = costData.bars;
        this.costYTicks = costData.ticks;
        this.maxCost = costData.max;

        const tokenData = this.buildBars(res.breakdown, r => r.total_tokens, false);
        this.dailyTokenBars = tokenData.bars;
        this.tokenYTicks = tokenData.ticks;
        this.maxTokens = tokenData.max;

        const reqData = this.buildBars(res.breakdown, r => r.response_count, false);
        this.dailyRequestBars = reqData.bars;
        this.requestYTicks = reqData.ticks;
        this.maxRequests = reqData.max;
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
    const map: Record<string, ModelStatInternal> = {};
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
          avg_latency_ms: null,
          _latencySum: 0,
          _latencyCount: 0,
        };
      }
      const s = map[row.model];
      s.response_count     += row.response_count;
      s.prompt_tokens      += row.prompt_tokens;
      s.completion_tokens  += row.completion_tokens;
      s.total_tokens       += row.total_tokens;
      s.estimated_cost_usd += row.estimated_cost_usd;
      if (row.avg_retrieval_latency_ms != null) {
        s._latencySum += row.avg_retrieval_latency_ms * row.response_count;
        s._latencyCount += row.response_count;
      }
    }
    this.modelStats = Object.values(map)
      .map(s => {
        if (s._latencyCount > 0) {
          s.avg_latency_ms = s._latencySum / s._latencyCount;
        }
        const cleanStat: ModelStat = { ...s };
        delete (cleanStat as any)._latencySum;
        delete (cleanStat as any)._latencyCount;
        return cleanStat;
      })
      .sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd);
  }

  private buildBars(
    rows: UsageBreakdownRow[],
    valFn: (r: UsageBreakdownRow) => number,
    isFloat: boolean
  ): { bars: DailyBar[], ticks: number[], max: number } {
    const byDate: Record<string, { model: string; value: number }[]> = {};
    for (const row of rows) {
      const key = row.date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        model: row.model,
        value: valFn(row),
      });
    }

    const dates = Object.keys(byDate).sort();
    const allTotals = dates.map(d => byDate[d].reduce((s, r) => s + r.value, 0));
    const maxVal  = Math.max(...allTotals, 0.0001);

    const bars = dates.map(date => {
      const segments = byDate[date];
      const totalValue = segments.reduce((s, r) => s + r.value, 0);
      return {
        date,
        label: this.formatDateLabel(date),
        totalValue,
        segments: segments
          .sort((a, b) => b.value - a.value)
          .map(s => ({
            model: s.model,
            value: s.value,
            color: this.modelColorMap[s.model] || '#6366f1',
            heightPct: totalValue > 0 ? (s.value / maxVal) * 100 : 0,
          })),
      };
    });

    const step = isFloat ? this.niceStep(maxVal) : Math.max(1, Math.ceil(this.niceStep(maxVal)));
    const ticks: number[] = [];
    for (let v = 0; v <= maxVal + step; v += step) {
      ticks.push(isFloat ? parseFloat(v.toFixed(4)) : Math.round(v));
      if (ticks.length > 6) break;
    }
    return { bars, ticks: ticks.reverse(), max: maxVal };
  }

  // ── Tooltip interactions ──────────────────────────────────────────────────
  onBarHover(event: MouseEvent, type: 'cost' | 'tokens' | 'requests', index: number): void {
    this.hoveredChartType = type;
    this.hoveredBarIndex = index;
    this.tooltipX = event.clientX + 15;
    this.tooltipY = event.clientY - 20;
  }

  onBarMove(event: MouseEvent): void {
    if (this.hoveredBarIndex !== null) {
      this.tooltipX = event.clientX + 15;
      this.tooltipY = event.clientY - 20;
    }
  }

  onBarLeave(): void {
    this.hoveredChartType = null;
    this.hoveredBarIndex = null;
  }

  getModelValueForBar(type: 'cost' | 'tokens' | 'requests', barIndex: number, model: string): number {
    let bars: DailyBar[];
    if (type === 'cost') bars = this.dailyCostBars;
    else if (type === 'tokens') bars = this.dailyTokenBars;
    else bars = this.dailyRequestBars;

    const bar = bars[barIndex];
    if (!bar) return 0;
    const seg = bar.segments.find(s => s.model === model);
    return seg ? seg.value : 0;
  }

  formatTooltipValue(type: 'cost' | 'tokens' | 'requests', val: number): string {
    if (type === 'cost') return `$${val.toFixed(3)}`;
    return this.formatCompact(val);
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
    if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
    return `$${v.toFixed(2)}`;
  }

  formatLatency(ms: number | null): string {
    if (ms == null) return '—';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
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
