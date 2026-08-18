import { Injectable } from '@angular/core';
import {
  AutoChartResult,
  ChartConfig,
  ChartDataset,
  ChartType,
  ColumnType,
} from '../models/chart-config.model';

/** Number of values sampled to classify a column's type. */
const SAMPLE_SIZE = 20;

const MAX_ROWS_BY_TYPE: Record<string, number> = {
  bar:      30,
  line:     200,
  pie:      20,
  doughnut: 20,
  scatter:  500,
  bubble:   500,
  radar:    20,
};
const DEFAULT_MAX_ROWS = 30;

/** Maximum categories before pie/doughnut are disqualified. */
const MAX_PIE_CATEGORIES = 8;

/**
 * Pure logic service that:
 *  1. Classifies DataGrid columns as numeric | date | categorical
 *  2. Applies Excel/Sheets/Tableau shape-matching rules to auto-pick chart type
 *  3. Builds a ChartConfig from the DataGrid rows
 *
 * No HTTP calls, no state — fully deterministic and unit-testable.
 */
@Injectable({ providedIn: 'root' })
export class ChartAutoPickService {

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Analyze DataGrid columns + rows, auto-select the best chart type.
   *
   * Shape-matching priority (same rules as Excel "Recommended Charts"):
   *  1. 1 date + 1+ numeric               → Line
   *  2. 2 numeric, no categorical/date     → Scatter
   *  3. 3+ numeric, no categorical/date    → Bubble (x, y, size)
   *  4. 1 categorical + 1 numeric, ≤8 cats → Pie
   *  5. 1 categorical + 1+ numeric         → Bar
   *  Fallback                               → Bar (first col as labels, rest as data)
   */
  autoPickChart(
    columns: string[],
    rows: Record<string, any>[]
  ): AutoChartResult {
    if (!columns.length || !rows.length) {
      return this._fallback(columns, rows);
    }

    const types = new Map<string, ColumnType>();
    columns.forEach(col => types.set(col, this.classifyColumn(rows, col)));

    const cats  = columns.filter(c => types.get(c) === 'categorical');
    const nums  = columns.filter(c => types.get(c) === 'numeric');
    const dates = columns.filter(c => types.get(c) === 'date');

    // Rule 1: Time series → Line
    if (dates.length >= 1 && nums.length >= 1) {
      const labelCol = dates[0];
      const dataCols = nums;
      return {
        config: this.buildConfig('line', labelCol, dataCols, rows),
        labelColumn: labelCol,
        dataColumns: dataCols,
        confidence: 'high',
      };
    }

    // Rule 2: Exactly 2 numerics, nothing else → Scatter
    if (nums.length === 2 && cats.length === 0 && dates.length === 0) {
      const labelCol = nums[0];
      const dataCols = [nums[1]];
      return {
        config: this.buildConfig('scatter', labelCol, dataCols, rows),
        labelColumn: labelCol,
        dataColumns: dataCols,
        confidence: 'high',
      };
    }

    // Rule 3: 3+ numerics, nothing else → Bubble (x, y, size from first 3)
    if (nums.length >= 3 && cats.length === 0 && dates.length === 0) {
      const labelCol = nums[0];
      const dataCols = [nums[1], nums[2]];
      return {
        config: this.buildConfig('bubble', labelCol, dataCols, rows),
        labelColumn: labelCol,
        dataColumns: dataCols,
        confidence: 'medium',
      };
    }

    // Rule 4: 1 categorical + 1+ numeric, small category set → Pie
    if (cats.length >= 1 && nums.length >= 1) {
      const labelCol = cats[0];
      const uniqueCategories = new Set(rows.map(r => String(r[labelCol] ?? ''))).size;
      const dataCols = nums.slice(0, 1); // pie only supports a single dataset

      if (nums.length === 1 && uniqueCategories <= MAX_PIE_CATEGORIES) {
        return {
          config: this.buildConfig('pie', labelCol, dataCols, rows),
          labelColumn: labelCol,
          dataColumns: dataCols,
          confidence: 'medium',
        };
      }

      // Rule 5: categorical + multiple numerics OR many categories → Bar
      const allDataCols = nums;
      return {
        config: this.buildConfig('bar', labelCol, allDataCols, rows),
        labelColumn: labelCol,
        dataColumns: allDataCols,
        confidence: 'high',
      };
    }

    return this._fallback(columns, rows);
  }

  /**
   * Classify a column as numeric, date, or categorical by sampling its values.
   */
  classifyColumn(rows: Record<string, any>[], colName: string): ColumnType {
    const samples = rows
      .map(r => r[colName])
      .filter(v => v !== null && v !== undefined && v !== '')
      .slice(0, SAMPLE_SIZE);

    if (samples.length === 0) return 'categorical';

    const allNumeric = samples.every(v => !isNaN(Number(v)));
    if (allNumeric) return 'numeric';

    const allDates = samples.every(v => {
      const s = String(v);
      if (!/[-\/:]/.test(s)) return false;
      if (s.length < 6) return false;
      return !isNaN(Date.parse(s));
    });
    if (allDates) return 'date';

    return 'categorical';
  }

  /**
   * Return all columns that can serve as an X-axis / label source
   * (categorical or date columns).
   */
  getLabelCandidates(
    columns: string[],
    rows: Record<string, any>[]
  ): string[] {
    return columns.filter(c => {
      const t = this.classifyColumn(rows, c);
      return t === 'categorical' || t === 'date';
    });
  }

  /**
   * For scatter/bubble charts, all numeric columns are valid X-axis candidates.
   * Returns all columns (since scatter can use any numeric column on either axis).
   */
  getScatterXCandidates(
    columns: string[],
    rows: Record<string, any>[]
  ): string[] {
    return columns;
  }

  /**
   * Return all columns that can serve as Y-axis data (numeric columns only).
   */
  getValueCandidates(
    columns: string[],
    rows: Record<string, any>[]
  ): string[] {
    return columns.filter(c => this.classifyColumn(rows, c) === 'numeric');
  }

  /**
   * Build a ChartConfig from explicit axis selections.
   * Used by the override toolbar when the user changes type/columns.
   *
   * IMPORTANT: scatter and bubble charts require point-object data formats:
   *   scatter → data: [{x, y}, ...]
   *   bubble  → data: [{x, y, r}, ...]
   * All other types use flat number arrays.
   */
  buildConfig(
    type: ChartType,
    labelColumn: string,
    dataColumns: string[],
    rows: Record<string, any>[],
    title?: string
  ): ChartConfig {
    const maxRows = MAX_ROWS_BY_TYPE[type] ?? DEFAULT_MAX_ROWS;
    const truncated = rows.slice(0, maxRows);

    let labels: string[];
    let _rawLabels: string[] | undefined;
    let datasets: ChartDataset[];

    if (type === 'scatter') {
      // X axis = labelColumn values (numeric), Y axis = first dataColumn.
      // Scatter ignores the labels[] array entirely — Chart.js uses {x,y} points.
      labels = [];
      const xCol = labelColumn;
      const yCol = dataColumns[0] ?? dataColumns[0];

      datasets = [{
        label: `${xCol} vs ${yCol}`,
        data: truncated.map(r => ({
          x: this._toNum(r[xCol]),
          y: this._toNum(r[yCol]),
        })),
      }];

    } else if (type === 'bubble') {
      // X = labelColumn, Y = first dataColumn, R = second dataColumn (or fixed 5).
      labels = [];
      const xCol = labelColumn;
      const yCol = dataColumns[0];
      const rCol = dataColumns[1] ?? null;

      // Normalise radius: scale the rCol values to a 3–20 range so bubbles
      // are readable regardless of the raw magnitude of the column.
      let rValues: number[] = [];
      if (rCol) {
        const raw = truncated.map(r => this._toNum(r[rCol]));
        const min = Math.min(...raw);
        const max = Math.max(...raw);
        const range = max - min || 1;
        rValues = raw.map(v => 3 + ((v - min) / range) * 17);
      }

      datasets = [{
        label: `${xCol} / ${yCol}${rCol ? ' / ' + rCol : ''}`,
        data: truncated.map((r, i) => ({
          x: this._toNum(r[xCol]),
          y: this._toNum(r[yCol]),
          r: rCol ? rValues[i] : 5,
        })),
      }];

    } else {
      // bar / line / pie / doughnut / radar — flat number arrays.
      _rawLabels = truncated.map(r => String(r[labelColumn] ?? ''));
      labels = _rawLabels.map(l => this._truncateLabel(l));

      datasets = dataColumns.map(col => ({
        label: col,
        data: truncated.map(r => this._toNum(r[col])),
      }));
    }

    const config: ChartConfig = { 
      type, 
      labels, 
      datasets, 
      _rawLabels,
      totalRows: rows.length,
      renderedRows: truncated.length
    };
    if (title) config.title = title;
    return config;
  }

  /** Safely convert a value to a number; returns 0 for null / non-numeric. */
  private _toNum(val: any): number {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  /** Truncate a label for chart display; full value shown in tooltip. */
  private _truncateLabel(label: string, maxLen: number = 16): string {
    return label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _fallback(
    columns: string[],
    rows: Record<string, any>[]
  ): AutoChartResult {
    // Last resort: first column as labels, remaining as numeric data.
    const labelCol = columns[0] ?? 'index';
    const dataCols = columns.slice(1).filter(c =>
      this.classifyColumn(rows, c) === 'numeric'
    );

    const effectiveCols = dataCols.length ? dataCols : columns.slice(1, 2);
    return {
      config: this.buildConfig('bar', labelCol, effectiveCols, rows),
      labelColumn: labelCol,
      dataColumns: effectiveCols,
      confidence: 'low',
    };
  }
}
