import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  AnyChartConfig,
  ChartConfig,
  ChartType,
  ColumnMappingConfig,
  isColumnMappingConfig,
} from '../../models/chart-config.model';
import { DataGridSource, KpiItem } from '../../models/conversation.model';
import { ChartAutoPickService } from '../../services/chart-auto-pick.service';

/** A fully-loaded dashboard panel ready for rendering. */
export interface DashboardPanel {
  /** Human-readable panel title from the LLM plan. */
  title: string;
  /** Short one-line subtitle from the LLM (stored inside chart_config.description). */
  description: string;
  /** Loaded data source (rows + columns). */
  source: DataGridSource;
  /** Resolved ChartConfig (materialised from column mapping or legacy). */
  chartConfig: ChartConfig | null;
  /** LLM-provided chart config before materialisation (kept for toolbar). */
  rawConfig: AnyChartConfig | null;
  /** SQL query string for the "Copy query" action. */
  sqlQuery: string;
  /** Toolbar column assignments. */
  labelColumn: string;
  dataColumns: string[];
  availableLabelColumns: string[];
  availableDataColumns: string[];
  /** Whether the mini-table is visible instead of the chart. */
  showTable: boolean;
  /** Whether the axis config panel is expanded. */
  showAxisConfig: boolean;
  /** Whether the panel actions dropdown is open. */
  showDropdown: boolean;
}

interface ChartTypeOption {
  type: ChartType;
  label: string;
  icon: string;
}

const CHART_TYPE_OPTIONS: ChartTypeOption[] = [
  { type: 'bar',      label: 'Bar',      icon: 'fa-solid fa-chart-bar' },
  { type: 'line',     label: 'Line',     icon: 'fa-solid fa-chart-line' },
  { type: 'pie',      label: 'Pie',      icon: 'fa-solid fa-chart-pie' },
  { type: 'doughnut', label: 'Doughnut', icon: 'fa-solid fa-circle-half-stroke' },
  { type: 'scatter',  label: 'Scatter',  icon: 'fa-solid fa-braille' },
  { type: 'radar',    label: 'Radar',    icon: 'fa-solid fa-star-of-life' },
];

@Component({
  selector: 'app-dashboard-layout',
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent implements OnChanges {
  /** Array of fully-loaded panels passed in from the parent. */
  @Input() panels: DashboardPanel[] = [];
  /** Optional dashboard title shown as a section header. */
  @Input() dashboardTitle: string = '';
  /** Optional headline KPI values rendered above the chart grid. */
  @Input() kpis: KpiItem[] = [];
  /** Emitted when user clicks "Refine with prompt" on a panel (future). */
  @Output() refinePanel = new EventEmitter<number>();

  /** Index of the currently focused (expanded) panel, or null for grid view. */
  focusedPanelIndex: number | null = null;
  /** Whether a dashboard screenshot capture is in progress. */
  isDownloading = false;

  readonly chartTypeOptions = CHART_TYPE_OPTIONS;

  constructor(
    private chartAutoPickService: ChartAutoPickService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef<HTMLElement>,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {}

  // ── Download dashboard as image ──────────────────────────────────────────

  async downloadDashboard(): Promise<void> {
    const wrapper = this.elRef.nativeElement.querySelector('.dashboard-wrapper') as HTMLElement;
    if (!wrapper || this.isDownloading) return;

    this.isDownloading = true;
    this.cdr.markForCheck();

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(wrapper, {
        scale: 2,                   // 2× for crisp retina output
        useCORS: true,
        backgroundColor: getComputedStyle(wrapper).backgroundColor || '#ffffff',
        logging: false,
        windowWidth: wrapper.scrollWidth,
        windowHeight: wrapper.scrollHeight,
      });

      const link = document.createElement('a');
      link.download = `${(this.dashboardTitle || 'dashboard').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('[DashboardLayout] Screenshot capture failed:', err);
    } finally {
      this.isDownloading = false;
      this.cdr.markForCheck();
    }
  }

  // ── Grid layout helpers ──────────────────────────────────────────────────

  get gridClass(): string {
    return this.panels.length > 4 ? 'cols-3' : 'cols-2';
  }

  /**
   * Line/scatter charts with many data points should span two grid columns
   * so the x-axis labels don't become cramped.
   */
  shouldEnlarge(panel: DashboardPanel): boolean {
    const type = panel.chartConfig?.type;
    const rows = panel.source?.rows?.length ?? 0;
    return (type === 'line' || type === 'scatter') && rows > 50;
  }

  isPanelVisible(index: number): boolean {
    return this.focusedPanelIndex === null || this.focusedPanelIndex === index;
  }

  // ── Focus / expand (modal overlay) ───────────────────────────────────────

  focusPanel(index: number): void {
    this.focusedPanelIndex = this.focusedPanelIndex === index ? null : index;
    // Lock body scroll when modal is open
    document.body.style.overflow = this.focusedPanelIndex !== null ? 'hidden' : '';
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.focusedPanelIndex !== null) {
      this.focusPanel(this.focusedPanelIndex);
    }
  }

  // ── Axis config toggle ───────────────────────────────────────────────────

  toggleAxisConfig(index: number): void {
    const panel = this.panels[index];
    if (!panel) return;
    panel.showAxisConfig = !panel.showAxisConfig;
    this.cdr.markForCheck();
  }

  onLabelChange(index: number, event: Event): void {
    const col = (event.target as HTMLSelectElement).value;
    this.onLabelColumnChange(index, col);
  }

  onDataColumnToggle(index: number, col: string): void {
    const panel = this.panels[index];
    if (!panel) return;
    const current = [...(panel.dataColumns ?? [])];
    const idx = current.indexOf(col);
    if (idx >= 0) {
      if (current.length === 1) return; // keep at least one
      current.splice(idx, 1);
    } else {
      current.push(col);
    }
    this.onDataColumnsChange(index, current);
  }

  isDataColSelected(panel: DashboardPanel, col: string): boolean {
    return (panel.dataColumns ?? []).includes(col);
  }

  // ── Dropdown menu ────────────────────────────────────────────────────────

  toggleDropdown(index: number): void {
    const panel = this.panels[index];
    if (!panel) return;
    const wasOpen = panel.showDropdown;
    // Close all dropdowns first
    this.panels.forEach(p => p.showDropdown = false);
    panel.showDropdown = !wasOpen;
    this.cdr.markForCheck();
  }

  @HostListener('document:click')
  closeAllDropdowns(): void {
    const anyOpen = this.panels.some(p => p.showDropdown);
    if (anyOpen) {
      this.panels.forEach(p => p.showDropdown = false);
      this.cdr.markForCheck();
    }
  }

  exportCsv(index: number): void {
    const panel = this.panels[index];
    if (!panel?.source?.rows?.length) return;
    panel.showDropdown = false;

    const cols = panel.source.columns;
    const headerRow = cols.join(',');
    const dataRows = panel.source.rows.map(row =>
      cols.map(c => {
        const val = row[c];
        const s = String(val ?? '');
        // Quote values containing commas, quotes, or newlines
        return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    );
    const csv = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${panel.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.cdr.markForCheck();
  }

  copyQuery(index: number): void {
    const panel = this.panels[index];
    if (!panel) return;
    panel.showDropdown = false;
    const q = panel.sqlQuery || 'No query available';
    navigator.clipboard.writeText(q).catch(() => {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = q;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    this.cdr.markForCheck();
  }

  removePanel(index: number): void {
    this.panels.splice(index, 1);
    if (this.focusedPanelIndex !== null) {
      if (this.focusedPanelIndex === index) this.focusedPanelIndex = null;
      else if (this.focusedPanelIndex > index) this.focusedPanelIndex--;
    }
    this.cdr.markForCheck();
  }

  // ── Per-panel chart toolbar handlers ────────────────────────────────────

  onTypeChange(panelIndex: number, type: ChartType): void {
    const panel = this.panels[panelIndex];
    if (!panel) return;
    const built = this.chartAutoPickService.buildConfig(
      type,
      panel.labelColumn,
      panel.dataColumns,
      panel.source.rows,
    );
    panel.chartConfig = built;
    this.cdr.markForCheck();
  }

  onLabelColumnChange(panelIndex: number, col: string): void {
    const panel = this.panels[panelIndex];
    if (!panel || !panel.chartConfig) return;
    panel.labelColumn = col;
    const built = this.chartAutoPickService.buildConfig(
      panel.chartConfig.type,
      col,
      panel.dataColumns,
      panel.source.rows,
    );
    panel.chartConfig = built;
    this.cdr.markForCheck();
  }

  onDataColumnsChange(panelIndex: number, cols: string[]): void {
    const panel = this.panels[panelIndex];
    if (!panel || !panel.chartConfig) return;
    panel.dataColumns = cols;
    const built = this.chartAutoPickService.buildConfig(
      panel.chartConfig.type,
      panel.labelColumn,
      cols,
      panel.source.rows,
    );
    panel.chartConfig = built;
    this.cdr.markForCheck();
  }

  toggleTable(panelIndex: number): void {
    const panel = this.panels[panelIndex];
    if (panel) {
      panel.showTable = !panel.showTable;
      this.cdr.markForCheck();
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  formatColumnHeader(col: string): string {
    return col
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
