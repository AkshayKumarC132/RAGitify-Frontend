/**
 * Chart.js-compatible configuration interfaces.
 *
 * These are produced by:
 *  1. The LLM backend (parsed from ```chart fenced code blocks)
 *  2. The client-side ChartAutoPickService (column-shape analysis)
 *
 * Both paths feed the same ChartRendererComponent so rendering is unified.
 */

export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'radar'
  | 'bubble';

/** A single scatter/bubble data point. */
export interface ScatterPoint { x: number; y: number; }
export interface BubblePoint  { x: number; y: number; r: number; }

export interface ChartDataset {
  /** Legend label for this series. */
  label: string;
  /**
   * - bar / line / pie / doughnut / radar → flat number[]
   * - scatter → ScatterPoint[]  ({ x, y })
   * - bubble  → BubblePoint[]   ({ x, y, r })
   */
  data: number[] | ScatterPoint[] | BubblePoint[];
}

export interface ChartConfig {
  /** Chart library type identifier. */
  type: ChartType;
  /** Optional chart title displayed above the canvas. */
  title?: string;
  /** Optional X-axis label. */
  xLabel?: string;
  /** Optional Y-axis label. */
  yLabel?: string;
  /** Category labels (x-axis for bar/line, slice labels for pie/doughnut). */
  labels: string[];
  /** One or more data series. */
  datasets: ChartDataset[];
  /** Whether to stack bar/line datasets. */
  stacked?: boolean;
  /** Raw (untruncated) labels — used by tooltip title callback. */
  _rawLabels?: string[];
  /** Total rows in the source data (before truncation). */
  totalRows?: number;
  /** How many rows were actually included in the chart. */
  renderedRows?: number;
}

/** Column data type classification used by ChartAutoPickService. */
export type ColumnType = 'numeric' | 'date' | 'categorical';

/** Result returned by ChartAutoPickService.autoPickChart(). */
export interface AutoChartResult {
  /** Full Chart.js-compatible config ready to render. */
  config: ChartConfig;
  /** Which column was chosen as the X-axis / labels source. */
  labelColumn: string;
  /** Which columns were chosen as Y-axis data series. */
  dataColumns: string[];
  /**
   * Confidence level of the auto-pick:
   *  - high: unambiguous shape match (e.g. 1 date + 1 numeric → line)
   *  - medium: reasonable guess (e.g. few categories → pie)
   *  - low: fallback heuristic applied
   */
  confidence: 'high' | 'medium' | 'low';
}
