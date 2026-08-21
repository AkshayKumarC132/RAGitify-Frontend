import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import type { Chart, ChartData, ChartOptions } from 'chart.js';
import { ChartConfig } from '../../models/chart-config.model';
import { ThemeService } from '../../services/theme.service';
import { Subscription } from 'rxjs';

/**
 * chart.js + all its controllers is ~250 kB, and SharedModule is eager, so a
 * static import puts the whole library in the initial bundle for every user —
 * including the ones who never open a chart. Load it on first render instead
 * and cache the promise so concurrent renderers share one fetch.
 */
let chartJsModule: Promise<typeof import('chart.js')> | null = null;
function loadChartJs(): Promise<typeof import('chart.js')> {
  if (!chartJsModule) {
    chartJsModule = import('chart.js').then((m) => {
      m.Chart.register(...m.registerables);
      return m;
    });
  }
  return chartJsModule;
}

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

/** 
 * Generates an array of colors that fade from the base color towards white.
 * Used for single-dimensional sectioned charts (Bar, Pie, Doughnut).
 */
function generateLighterGradient(baseRgba: string, steps: number, theme: 'light' | 'dark'): string[] {
  const match = baseRgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match || steps <= 1) return Array(steps || 1).fill(baseRgba);
  
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const a = match[4] ? parseFloat(match[4]) : 1;

  const result = [];
  // We cap the lightening factor so it doesn't become completely invisible
  const maxFactor = theme === 'dark' ? 0.6 : 0.75; 

  for (let i = 0; i < steps; i++) {
    const factor = steps === 1 ? 0 : (i / (steps - 1)) * maxFactor;
    // Interpolate towards white
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    
    result.push(`rgba(${newR}, ${newG}, ${newB}, ${a})`);
  }
  
  return result;
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
export class ChartRendererComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config!: ChartConfig;

  @ViewChild('chartCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private chartInstance: Chart | null = null;
  private _pendingBuild = false;
  private _destroyed = false;
  /** Incremented per build so a slow dynamic import can't paint a stale chart. */
  private _buildToken = 0;
  private themeSub?: Subscription;

  constructor(private cdr: ChangeDetectorRef, private themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.theme$.subscribe(() => {
      if (this.chartInstance) {
        this._scheduleBuild();
      }
    });
  }

  ngAfterViewInit(): void {
    // Defer chart creation to the next animation frame so the DOM is fully
    // laid out. During SPA navigation the container may not have its final
    // width yet in ngOnInit/ngAfterViewInit — requestAnimationFrame waits
    // until after layout + paint, giving Chart.js accurate dimensions.
    this._scheduleBuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chartInstance && changes['config']) {
      this._scheduleBuild();
    }
  }

  ngOnDestroy(): void {
    this._pendingBuild = false;
    this._destroyed = true;
    this.themeSub?.unsubscribe();
    this.destroyChart();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async buildChart(): Promise<void> {
    if (!this.canvasRef || !this.config) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const token = ++this._buildToken;
    const { Chart } = await loadChartJs();
    // The component may have been destroyed, or a newer build queued, while
    // the chunk was in flight.
    if (this._destroyed || token !== this._buildToken || !this.config) return;

    const currentTheme = this.themeService.getCurrentTheme();
    const palette = currentTheme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT;
    const type = this.config.type;
    const isScatterLike = type === 'scatter' || type === 'bubble';
    const isPolar = type === 'pie' || type === 'doughnut' || type === 'radar';
    const supportsSections = type === 'bar' || type === 'pie' || type === 'doughnut';

    const chartData: ChartData = {
      // scatter/bubble don't use labels[] at all — Chart.js reads x/y from point objects
      labels: isScatterLike ? [] : this.config.labels,
      datasets: this.config.datasets.map((ds, i) => {
        const baseColor = palette[i % palette.length];
        const baseBorderColor = baseColor.replace('0.8', '1').replace('0.85', '1');
        const isSingleDataset = this.config.datasets.length === 1;
        const dataLength = ds.data.length;

        let backgroundColor: string | string[] = baseColor;
        let borderColor: string | string[] = baseBorderColor;

        if (isSingleDataset && supportsSections && dataLength > 1) {
          backgroundColor = generateLighterGradient(baseColor, dataLength, currentTheme);
          borderColor = generateLighterGradient(baseBorderColor, dataLength, currentTheme);
        }

        return {
          label: ds.label,
          data: ds.data as any,
          backgroundColor,
          borderColor,
          borderWidth: type === 'line' ? 2 : 1,
          fill: false,
          tension: 0.4,
          // Scatter needs larger points to be visible; bubble radius comes from data.r
          pointRadius: type === 'scatter' ? 6 : (type === 'line' ? 4 : 3),
          pointHoverRadius: type === 'scatter' ? 8 : 5,
        };
      }),
    };

    const gridColor = currentTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.08)';
    const textColor = currentTheme === 'dark' ? '#d1d5db' : '#374151';
    // Canvas text is not styled by CSS, so pull the product typeface off the
    // root custom property — otherwise chart labels drift away from the UI
    // whenever the design system's font token changes.
    const fontFamily = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-font')
      .trim() || 'Geist, Inter, system-ui, sans-serif';

    // Scatter/bubble need linear numeric scales on both axes.
    // Bar/line/etc. need category scale on X.
    const xScaleType = isScatterLike ? 'linear' : 'category';

    const chartOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: isPolar ? 1.5 : 1.6,
      // Prevent layout recalculations on hover/tooltip that cause title/label jitter.
      resizeDelay: 100,
      layout: {
        padding: {
          top: this.config.title ? 4 : 8,
          right: 8,
          bottom: 4,
          left: 4,
        },
      },
      animation: { duration: 350 },
      plugins: {
        legend: {
          display: false,
          labels: { color: textColor, font: { family: fontFamily, size: 12, weight: 500 } },
        },
        title: {
          display: !!this.config.title,
          text: this.config.title ?? '',
          color: textColor,
          font: { family: fontFamily, size: 14, weight: 600 },
          padding: { top: 0, bottom: 12 },
        },
        tooltip: {
          // 'index' mode requires a matching labels array — breaks on scatter.
          // 'nearest' works correctly for point-based charts.
          mode: isScatterLike ? 'nearest' : 'index',
          intersect: isScatterLike,
          // Use 'nearest' position so the tooltip floats near the cursor
          // instead of shifting the chart layout.
          position: 'nearest',
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
          ticks: { color: textColor, font: { family: fontFamily, size: 11 }, maxRotation: 45 },
          grid: { color: gridColor },
          title: this.config.xLabel
            ? { display: true, text: this.config.xLabel, color: textColor }
            : { display: false },
        },
        y: {
          stacked: this.config.stacked ?? false,
          ticks: { 
            color: textColor, 
            font: { family: fontFamily, size: 11 },
            callback: (value: any) => formatAxisValue(value),
          },
          grid: { color: gridColor },
          title: this.config.yLabel
            ? { display: true, text: this.config.yLabel, color: textColor }
            : { display: false },
        },
      },
    };

    this.destroyChart();
    this.chartInstance = new Chart(ctx, {
      type: type as any,
      data: chartData,
      options: chartOptions,
    });
    this.cdr.markForCheck();
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  /**
   * Schedule a chart (re)build on the next animation frame.
   * Coalesces multiple rapid calls (e.g. config + themeMode changing together)
   * and ensures the DOM is fully laid out before Chart.js reads dimensions.
   */
  private _scheduleBuild(): void {
    if (this._pendingBuild) return;
    this._pendingBuild = true;
    requestAnimationFrame(() => {
      if (!this._pendingBuild) return; // component was destroyed
      this._pendingBuild = false;
      this.destroyChart();
      this.buildChart();
    });
  }

  private rebuildChart(): void {
    this.destroyChart();
    this.buildChart();
  }

  /** Export the chart as a PNG data URL (called by parent via template ref). */
  toBase64Image(): string | null {
    return this.chartInstance?.toBase64Image() ?? null;
  }

  /** Download the chart as a PNG image file. */
  downloadAsPng(): void {
    const dataUrl = this.chartInstance?.toBase64Image();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }
}
