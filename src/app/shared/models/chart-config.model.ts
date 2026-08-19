/**
 * Chart.js-compatible configuration interfaces.
 *
 * These are produced by:
 *  1. The LLM backend (parsed from ```chart fenced code blocks)
 *  2. The client-side ChartAutoPickService (column-shape analysis)
 *
 * Both paths feed the same ChartRendererComponent so rendering is unified.
 *
 * Two LLM chart schemas are supported:
 *  - ColumnMappingConfig  (_schema: "column_mapping") — new, preferred.
 *    The LLM declares which columns to use; the frontend materialises the
 *    chart from the complete DataGrid rows via ChartAutoPickService.buildConfig().
 *  - ChartConfig (legacy) — backward-compat. The LLM hardcoded labels+data.
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

/**
 * Declarative column-mapping chart config produced by the LLM (new schema).
 *
 * The LLM specifies *which* columns to use; the Angular frontend materialises
 * the full ChartConfig from the complete DataGrid rows at render time.
 * This ensures the chart always uses all rows, not just the 3-row preview.
 */
export interface ColumnMappingConfig {
  /** Discriminator — always "column_mapping". */
  _schema: 'column_mapping';
  /** Chart type to render. */
  type: ChartType;
  /** Optional chart title. */
  title?: string;
  /** Optional X-axis label. */
  xLabel?: string;
  /** Optional Y-axis label. */
  yLabel?: string;
  /** Column name to use as X-axis / category labels. */
  xColumn: string;
  /** Column names to use as Y-axis data series (1–5 entries). */
  yColumns: string[];
  /** Whether to stack bar/line datasets. */
  stacked?: boolean;
}

/**
 * Type guard: returns true when the value is a ColumnMappingConfig.
 * Safe to call on any unknown value from an API response.
 */
export function isColumnMappingConfig(c: unknown): c is ColumnMappingConfig {
  return (
    typeof c === 'object' &&
    c !== null &&
    (c as Record<string, unknown>)['_schema'] === 'column_mapping'
  );
}

/** Union type for any LLM-produced chart config (either schema). */
export type AnyChartConfig = ChartConfig | ColumnMappingConfig;

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
