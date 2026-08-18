import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import { ChartConfig } from '../../models/chart-config.model';

// Register all Chart.js components once globally.
Chart.register(...registerables);

/** Format large numbers as K / M / B for axis ticks. */
function formatAxisValue(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (abs >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 10_000)        return (n / 1_000).toFixed(1) + 'K';
  if (abs < 1 && n !== 0)   return n.toFixed(2);
  return n.toLocaleString();
}

/** Harmonious 8-colour palette used for datasets (cycled). */
const PALETTE_LIGHT = [
  'rgba(99, 102, 241, 0.8)',   // indigo
  'rgba(6, 182, 212, 0.8)',    // cyan
  'rgba(245, 158, 11, 0.8)',   // amber
  'rgba(16, 185, 129, 0.8)',   // emerald
  'rgba(239, 68, 68, 0.8)',    // red
  'rgba(139, 92, 246, 0.8)',   // violet
  'rgba(236, 72, 153, 0.8)',   // pink
  'rgba(20, 184, 166, 0.8)',   // teal
];

const PALETTE_DARK = [
  'rgba(129, 140, 248, 0.85)',  // indigo-lighter
  'rgba(34, 211, 238, 0.85)',   // cyan-lighter
  'rgba(251, 191, 36, 0.85)',   // amber-lighter
  'rgba(52, 211, 153, 0.85)',   // emerald-lighter
  'rgba(248, 113, 113, 0.85)',  // red-lighter
  'rgba(167, 139, 250, 0.85)',  // violet-lighter
  'rgba(244, 114, 182, 0.85)',  // pink-lighter
  'rgba(45, 212, 191, 0.85)',   // teal-lighter
];

/**
 * Renders a Chart.js chart from a ChartConfig.
 *
 * Supports both the LLM-generated chart path (config arrives from backend)
 * and the user-driven auto-pick path (config built by ChartAutoPickService).
 */
@Component({
  selector: 'app-chart-renderer',
  templateUrl: './chart-renderer.component.html',
  styleUrls: ['./chart-renderer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartRendererComponent implements OnInit, OnChanges, OnDestroy {
  @Input() config!: ChartConfig;
  @Input() themeMode: 'light' | 'dark' = 'light';

  @ViewChild('chartCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private chartInstance: Chart | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.buildChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chartInstance && (changes['config'] || changes['themeMode'])) {
      this.rebuildChart();
    }
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private buildChart(): void {
    if (!this.canvasRef || !this.config) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const palette = this.themeMode === 'dark' ? PALETTE_DARK : PALETTE_LIGHT;
    const type = this.config.type;
    const isScatterLike = type === 'scatter' || type === 'bubble';
    const isPolar = type === 'pie' || type === 'doughnut' || type === 'radar';

    const chartData: ChartData = {
      // scatter/bubble don't use labels[] at all — Chart.js reads x/y from point objects
      labels: isScatterLike ? [] : this.config.labels,
      datasets: this.config.datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data as any,
        backgroundColor: palette[i % palette.length],
        borderColor: palette[i % palette.length].replace('0.8', '1').replace('0.85', '1'),
        borderWidth: type === 'line' ? 2 : 1,
        fill: false,
        tension: 0.4,
        // Scatter needs larger points to be visible; bubble radius comes from data.r
        pointRadius: type === 'scatter' ? 6 : (type === 'line' ? 4 : 3),
        pointHoverRadius: type === 'scatter' ? 8 : 5,
      })),
    };

    const gridColor = this.themeMode === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.08)';
    const textColor = this.themeMode === 'dark' ? '#d1d5db' : '#374151';

    // Scatter/bubble need linear numeric scales on both axes.
    // Bar/line/etc. need category scale on X.
    const xScaleType = isScatterLike ? 'linear' : 'category';

    const chartOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 350 },
      plugins: {
        legend: {
          display: false,
          labels: { color: textColor, font: { family: 'Inter, system-ui, sans-serif', size: 12 } },
        },
        title: {
          display: !!this.config.title,
          text: this.config.title ?? '',
          color: textColor,
          font: { family: 'Inter, system-ui, sans-serif', size: 14, weight: 'bold' },
          padding: { bottom: 12 },
        },
        tooltip: {
          // 'index' mode requires a matching labels array — breaks on scatter.
          // 'nearest' works correctly for point-based charts.
          mode: isScatterLike ? 'nearest' : 'index',
          intersect: isScatterLike,
          callbacks: {
            title: (items: any[]) => {
              // If config has raw (untruncated) labels stored, prefer those for tooltip title
              const idx = items[0]?.dataIndex;
              return this.config._rawLabels?.[idx] ?? items[0]?.label ?? '';
            },
            label: (ctx: any) => {
              const label = ctx.dataset.label || '';
              const raw = ctx.raw;
              if (typeof raw === 'object' && raw !== null) {
                // scatter/bubble → {x, y} or {x, y, r}
                return `${label}: (${formatAxisValue(raw.x)}, ${formatAxisValue(raw.y)})`;
              }
              return `${label}: ${formatAxisValue(raw)}`;
            },
          },
        },
      },
      scales: isPolar ? {} : {
        x: {
          type: xScaleType as any,
          stacked: this.config.stacked ?? false,
          ticks: { color: textColor, font: { family: 'Inter, system-ui, sans-serif', size: 11 }, maxRotation: 45 },
          grid: { color: gridColor },
          title: this.config.xLabel
            ? { display: true, text: this.config.xLabel, color: textColor }
            : { display: false },
        },
        y: {
          stacked: this.config.stacked ?? false,
          ticks: { 
            color: textColor, 
            font: { family: 'Inter, system-ui, sans-serif', size: 11 },
            callback: (value: any) => formatAxisValue(value),
          },
          grid: { color: gridColor },
          title: this.config.yLabel
            ? { display: true, text: this.config.yLabel, color: textColor }
            : { display: false },
        },
      },
    };

    this.chartInstance = new Chart(ctx, {
      type: type as any,
      data: chartData,
      options: chartOptions,
    });
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private rebuildChart(): void {
    this.destroyChart();
    this.buildChart();
  }

  /** Export the chart as a PNG data URL (called by parent via template ref). */
  toBase64Image(): string | null {
    return this.chartInstance?.toBase64Image() ?? null;
  }
}
