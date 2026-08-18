import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Message } from '../../models/message.model';
import { Run } from '../../models/run.model';
import {
  DataGridResponse,
  DataGridSource,
} from '../../models/conversation.model';
import { ChartConfig, ChartType } from '../../models/chart-config.model';
import { ConversationService } from '../../services/conversation.service';
import { DatagridAttachmentService } from '../../services/datagrid-attachment.service';
import { ChartAutoPickService } from '../../services/chart-auto-pick.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-message-bubble',
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBubbleComponent implements OnInit, OnDestroy, OnChanges {
  // Relaxed type to accept Message (number id) or generic object with compatible fields (e.g. ConversationMessage with string id)
  @Input() message!: any;
  @Input() isLast: boolean = false;
  @Input() canRerun: boolean = false;
  @Input() run: Run | undefined;
  @Input() rerunLoading: boolean = false;
  @Input() showPager: boolean = false;
  @Input() pageLabel: string = '';
  @Input() pagerHasPrev: boolean = false;
  @Input() pagerHasNext: boolean = false;
  @Input() showSources: boolean = true;
  @Input() isStreaming: boolean = false;
  @Input() conversationId?: string;
  @Input() enableDataGrid: boolean = false;
  @Output() rerun = new EventEmitter<void>();
  @Output() pagerPrev = new EventEmitter<void>();
  @Output() pagerNext = new EventEmitter<void>();

  displayContent: string = '';
  renderedContent: SafeHtml | null = null;
  copied = false;
  sqlCopied = false;

  // ── Multi-source data grid state ──────────────────────────────────
  /** All sources parsed from the API response */
  dataSources: DataGridSource[] = [];
  /** Index of the currently selected tab */
  activeSourceIndex: number = 0;
  /** grid_id → SQL string map from the API */
  sqlQueryMap: Record<string, string> = {};

  // Legacy flat state — kept for backwards compat with ephemeral metadata path
  dataGridColumns: string[] = [];
  dataGridRows: Record<string, any>[] = [];

  // Data Grid Modal State (used by non-inline bar fallback)
  showDataGridModal = false;
  dataGridLoading = false;
  modalDataGridColumns: string[] = [];
  modalDataGridRows: Record<string, any>[] = [];

  // New Datagrid Features State
  searchQuery: string = '';
  density: 'compact' | 'comfortable' | 'spacious' = 'comfortable';
  columnVisibility: Record<string, boolean> = {}; // false means hidden
  pageSize: number = 25;
  currentPage: number = 1;
  showColumnMenu: boolean = false;
  showDensityMenu: boolean = false;
  showExportMenu: boolean = false;

  // SQL Modal State
  showSqlModal = false;
  sqlActiveSourceIndex: number = 0;

  // Inline Data Grid State
  private inlineDataLoaded = false;

  // ── Chart state ──────────────────────────────────────────────────────
  /** Active chart config (null = no chart shown) */
  activeChartConfig: ChartConfig | null = null;
  /** Whether the chart panel is visible */
  showChart = false;
  /** True when the chart was auto-displayed from LLM-generated chart_config (Path 1). */
  isLlmChart = false;
  /** Which column drives the X-axis / labels */
  chartLabelColumn: string = '';
  /** Which columns drive the Y-axis datasets */
  chartDataColumns: string[] = [];
  /** All columns eligible as X-axis (categorical/date) */
  chartAvailableLabelColumns: string[] = [];
  /** All columns eligible as Y-axis (numeric) */
  chartAvailableDataColumns: string[] = [];

  private copyResetTimeout?: ReturnType<typeof setTimeout>;
  private sqlCopyResetTimeout?: ReturnType<typeof setTimeout>;
  private previousContent: string = '';
  private previousEnableDataGrid: boolean = false;

  constructor(
    private sanitizer: DomSanitizer,
    private conversationService: ConversationService,
    private datagridAttachmentService: DatagridAttachmentService,
    private chartAutoPickService: ChartAutoPickService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  // ── Computed getters ──────────────────────────────────────────────

  get activeSource(): DataGridSource | null {
    return this.dataSources[this.activeSourceIndex] ?? null;
  }

  /** SQL source for the SQL modal's active tab (independent of datagrid tab) */
  get sqlActiveSource(): (typeof this.dataSources)[0] | null {
    return this.dataSources[this.sqlActiveSourceIndex] ?? null;
  }

  /** SQL for the SQL modal's currently selected source */
  get activeSqlQuery(): string | null {
    if (!this.sqlActiveSource) return null;
    return this.sqlQueryMap[this.sqlActiveSource.grid_id] ?? null;
  }

  /** Human-readable source name for the SQL modal's currently selected source */
  get activeSqlSourceName(): string {
    return this.sqlActiveSource?.source_name ?? '';
  }

  get isFailedRun(): boolean {
    return !this.isUser && this.run?.status === 'failed';
  }

  get runErrorMessage(): string {
    const msg = this.run?.metadata?.['error_message'];
    return typeof msg === 'string' ? msg : '';
  }

  get showRunErrorInfo(): boolean {
    return this.isFailedRun && !!this.runErrorMessage;
  }

  ngOnInit() {
    this.previousContent = this.message?.content || '';
    this.previousEnableDataGrid = this.enableDataGrid;
    const safeContent = this.sanitizeContent(this.message.content);
    this.displayContent = safeContent;
    this.updateRenderedContent();
    this.extractLegacyDataGrid();
    this.checkInlineDataLoad();

    // Auto-display LLM-generated chart from the message payload.
    // This handles the compact bar path where the DataGrid API isn't called
    // at page load — the message list serializer already includes chart_config.
    if (this.message?.data_grid_chart_config && !this.showChart) {
      this._applyChartConfig(this.message.data_grid_chart_config);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['run'] || changes['message']) {
      this.previousContent = this.message?.content || '';
      const safeContent = this.sanitizeContent(this.message?.content || '');
      this.displayContent = safeContent;
      this.updateRenderedContent();
      this.extractLegacyDataGrid();
      this.checkInlineDataLoad();
    }

    if (changes['enableDataGrid']) {
      this.checkInlineDataLoad();
    }
  }

  private checkInlineDataLoad(): void {
    if (!this.enableDataGrid || !this.hasDataGrid || this.inlineDataLoaded) {
      return;
    }

    // Try ephemeral metadata first (streaming path — legacy flat structure)
    if (this.dataGridRows.length > 0) {
      this.dataSources = [
        {
          grid_id: 'ephemeral',
          source_key: '',
          source_name: '',
          rows: this.dataGridRows,
          columns: this.dataGridColumns,
        },
      ];
      this.inlineDataLoaded = true;
      return;
    }

    if (!this.conversationId || !this.message?.id || this.dataGridLoading) {
      return;
    }

    this.dataGridLoading = true;
    this.conversationService
      .getDataGrid(this.conversationId, this.message.id)
      .subscribe({
        next: (res) => {
          this.parseDataGridResponse(res);
          this.dataGridLoading = false;
          this.inlineDataLoaded = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[MessageBubble] Error loading inline data grid:', err);
          this.dataGridLoading = false;
          if (err.status !== 404) {
            this.inlineDataLoaded = true;
          }
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Parse the multi-source DataGridResponse from the API into DataGridSource[].
   * Also populates sqlQueryMap.
   */
  private parseDataGridResponse(res: DataGridResponse): void {
    // Populate SQL query map (grid_id → sql string)
    if (res.sql_query && typeof res.sql_query === 'object') {
      this.sqlQueryMap = res.sql_query;
    } else {
      this.sqlQueryMap = {};
    }

    if (!res.data || !Array.isArray(res.data)) {
      this.dataSources = [];
      return;
    }

    this.dataSources = res.data
      .filter((g) => Array.isArray(g.rows) && g.rows.length > 0)
      .map((g) => {
        const sanitizedRows = g.rows.map((row) => this.sanitizeRow(row));
        return {
          grid_id: g.grid_id,
          source_key: g.source_key ?? '',
          source_name: g.source_name ?? '',
          rows: sanitizedRows,
          columns:
            sanitizedRows.length > 0 ? Object.keys(sanitizedRows[0]) : [],
        };
      });

    this.activeSourceIndex = 0;
    this.searchQuery = '';
    this.currentPage = 1;
    this.columnVisibility = {};

    // Apply LLM-generated chart config from the DataGrid API response.
    if (res.chart_config && !this.showChart) {
      this._applyChartConfig(res.chart_config);
    }
  }

  private sanitizeContent(content?: string): string {
    if (!content) {
      return content || '';
    }
    if (this.message?.role === 'assistant' && this.run?.status === 'failed') {
      return 'Oops!';
    }
    return content;
  }

  ngOnDestroy(): void {
    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
    }
    if (this.sqlCopyResetTimeout) {
      clearTimeout(this.sqlCopyResetTimeout);
    }
  }

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  get isCancelledRun(): boolean {
    const hasEmptyContent =
      !this.message.content ||
      (typeof this.message.content === 'string' &&
        this.message.content.trim() === '');
    return !this.isUser && this.run?.status === 'cancelled' && hasEmptyContent;
  }

  get showEmptyState(): boolean {
    return this.isCancelledRun;
  }

  get hasBubbleContent(): boolean {
    if (this.showEmptyState || this.showRunErrorInfo) return true;
    if (this.displayContent && this.displayContent.trim().length > 0)
      return true;
    if (
      this.showSources &&
      !this.isUser &&
      this.getDocumentIds(this.message).length > 0
    )
      return true;
    return false;
  }

  get isHidden(): boolean {
    if (this.isUser) return false;
    if (this.hasBubbleContent) return false;
    if (this.hasDataGrid) return false;
    return true;
  }

  get attachedDocuments(): Array<{ id: string; name: string }> {
    const attachedDocuments = this.message?.metadata?.['attached_documents'];
    if (!Array.isArray(attachedDocuments)) {
      return [];
    }

    return attachedDocuments
      .map((document) => ({
        id: String(document?.id || ''),
        name: String(document?.name || '').trim(),
      }))
      .filter((document) => !!document.id && !!document.name);
  }

  get attachedConnectors(): Array<{ id: string; name: string; type: string }> {
    const connectors = this.message?.metadata?.['attached_connectors'];
    if (!Array.isArray(connectors)) {
      return [];
    }
    return connectors
      .map((c) => ({
        id: String(c?.id || ''),
        name: String(c?.name || '').trim(),
        type: String(c?.type || ''),
      }))
      .filter((c) => !!c.id && !!c.name);
  }

  getConnectorIcon(type: string): string {
    const t = (type || '').toLowerCase();
    if (t.includes('postgres') || t.includes('pg_') || t.includes('supabase'))
      return 'fa-solid fa-database';
    if (t.includes('clickhouse')) return 'fa-solid fa-database';
    if (t.includes('mysql') || t.includes('mariadb'))
      return 'fa-solid fa-database';
    if (t.includes('mongo')) return 'fa-solid fa-database';
    if (t.includes('sqlite')) return 'fa-solid fa-database';
    if (t.includes('mssql') || t.includes('sql server'))
      return 'fa-solid fa-database';
    if (t.includes('oracle')) return 'fa-solid fa-database';
    return 'fa-solid fa-plug';
  }

  getConnectorIconUrl(type: string): string | null {
    const t = (type || '').toLowerCase();
    if (t.includes('postgres') || t.includes('pg_') || t.includes('supabase'))
      return 'assets/postgres.svg';
    if (t.includes('clickhouse') || t.includes('clk'))
      return 'assets/clickhouse.svg';
    if (t.includes('mysql') || t.includes('mariadb')) return 'assets/mysql.svg';
    if (t.includes('mongo')) return 'assets/mongodb.svg';
    if (t.includes('redis')) return 'assets/redis.svg';
    if (t.includes('snowflake')) return 'assets/snowflake.svg';
    if (t.includes('bigquery')) return 'assets/bigquery.svg';
    return null;
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private updateRenderedContent(): void {
    if (this.isUser) {
      this.renderedContent = null;
      return;
    }

    const raw = this.displayContent || '';

    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    const html = marked.parse(raw) as string;
    const sanitized = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
    });
    this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  private sanitizeRow(row: any): Record<string, any> {
    const sanitized: Record<string, any> = { ...row };
    for (const key in sanitized) {
      if (sanitized[key] !== null && typeof sanitized[key] === 'object') {
        sanitized[key] = JSON.stringify(sanitized[key]);
      }
    }
    return sanitized;
  }

  /** Legacy: read flat data_grid from message metadata (ephemeral streaming path) */
  private extractLegacyDataGrid(): void {
    this.dataGridColumns = [];
    this.dataGridRows = [];

    const grid = this.message?.metadata?.['data_grid'];
    if (!grid || !Array.isArray(grid) || !grid.length) return;

    const rows: Record<string, any>[] = [];
    if (grid.length > 0 && !Array.isArray(grid[0])) {
      rows.push(...grid.map((r: any) => this.sanitizeRow(r)));
    } else {
      for (const subArray of grid) {
        if (Array.isArray(subArray)) {
          rows.push(...subArray.map((r: any) => this.sanitizeRow(r)));
        }
      }
    }

    if (rows.length) {
      this.dataGridColumns = Object.keys(rows[0]);
      this.dataGridRows = rows;
    }
  }

  get hasDataGrid(): boolean {
    return (
      !!this.message?.has_data_grid || !!this.message?.metadata?.['data_grid']
    );
  }

  // ── Chart handlers ────────────────────────────────────────────────────────

  /** Called by "Visualize" button on the DataGrid bar. */
  onVisualizeClick(): void {
    const src = this.activeSource;
    if (!src?.rows?.length || !src?.columns?.length) return;

    const result = this.chartAutoPickService.autoPickChart(src.columns, src.rows);
    this.chartLabelColumn = result.labelColumn;
    this.chartDataColumns = result.dataColumns;
    const isScatterLike = result.config.type === 'scatter' || result.config.type === 'bubble';
    this.chartAvailableLabelColumns = isScatterLike
      ? this.chartAutoPickService.getScatterXCandidates(src.columns, src.rows)
      : this.chartAutoPickService.getLabelCandidates(src.columns, src.rows);
    this.chartAvailableDataColumns  = this.chartAutoPickService.getValueCandidates(src.columns, src.rows);
    this.activeChartConfig = result.config;
    this.showChart = true;
    this.isLlmChart = false;
    this.cdr.markForCheck();
  }

  /** Type pill clicked in toolbar — re-build config with new type. */
  onChartTypeChange(type: ChartType): void {
    if (!this.activeSource?.rows) return;
    
    // Recompute X-axis candidates — scatter needs all columns, others need categorical/date.
    const isScatterLike = type === 'scatter' || type === 'bubble';
    const src = this.activeSource;
    this.chartAvailableLabelColumns = isScatterLike
      ? this.chartAutoPickService.getScatterXCandidates(src.columns, src.rows)
      : this.chartAutoPickService.getLabelCandidates(src.columns, src.rows);
      
    // If current label column isn't in the new candidate list, reset to first available.
    if (!this.chartAvailableLabelColumns.includes(this.chartLabelColumn)) {
      this.chartLabelColumn = this.chartAvailableLabelColumns[0] ?? src.columns[0];
    }
    
    this.activeChartConfig = this.chartAutoPickService.buildConfig(
      type,
      this.chartLabelColumn,
      this.chartDataColumns,
      this.activeSource.rows,
      this.activeChartConfig?.title,
    );
    this.cdr.markForCheck();
  }

  /** X-axis dropdown changed — re-build config. */
  onChartLabelColumnChange(col: string): void {
    if (!this.activeSource?.rows) return;
    this.chartLabelColumn = col;
    this.activeChartConfig = this.chartAutoPickService.buildConfig(
      this.activeChartConfig?.type ?? 'bar',
      col,
      this.chartDataColumns,
      this.activeSource.rows,
      this.activeChartConfig?.title,
    );
    this.cdr.markForCheck();
  }

  /** Y-axis checkboxes changed — re-build config. */
  onChartDataColumnsChange(cols: string[]): void {
    if (!cols.length || !this.activeSource?.rows) return;
    this.chartDataColumns = cols;
    this.activeChartConfig = this.chartAutoPickService.buildConfig(
      this.activeChartConfig?.type ?? 'bar',
      this.chartLabelColumn,
      cols,
      this.activeSource.rows,
      this.activeChartConfig?.title,
    );
    this.cdr.markForCheck();
  }

  /** Close/dismiss the chart panel. */
  onCloseChart(): void {
    this.showChart = false;
    this.activeChartConfig = null;
    this.isLlmChart = false;
    this.cdr.markForCheck();
  }

  /** Download current chart as PNG. */
  onDownloadChartPng(rendererRef: any): void {
    const dataUrl = rendererRef?.toBase64Image?.();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  /**
   * Apply a ChartConfig (from LLM or API) and compute available axis columns
   * from the active data source (if already loaded).
   */
  private _applyChartConfig(config: ChartConfig): void {
    this.activeChartConfig = config;
    this.showChart = true;
    this.isLlmChart = true;

    // Compute label/value candidates from the first data source, if available.
    const src = this.activeSource ?? this.dataSources[0];
    if (src?.columns?.length && src?.rows?.length) {
      this.chartAvailableLabelColumns = this.chartAutoPickService.getLabelCandidates(src.columns, src.rows);
      this.chartAvailableDataColumns  = this.chartAutoPickService.getValueCandidates(src.columns, src.rows);
      // Infer axis assignments from config datasets
      this.chartLabelColumn  = src.columns.find(c => !config.datasets.map(d => d.label).includes(c)) ?? src.columns[0];
      this.chartDataColumns  = config.datasets.map(d => d.label);
    }
  }

  /**
   * Called by the "Visualize" button on the compact DataGrid bar (non-inline path).
   * Loads data from the API first if not already cached, then runs auto-pick.
   */
  onVisualizeFromBar(): void {
    // If data is already loaded, just run auto-pick directly.
    if (this.dataSources.length > 0) {
      this.onVisualizeClick();
      return;
    }

    // Otherwise, fetch data from the API first.
    if (!this.conversationId || !this.message?.id || this.dataGridLoading) return;

    this.dataGridLoading = true;
    this.cdr.markForCheck();

    this.conversationService
      .getDataGrid(this.conversationId, this.message.id)
      .subscribe({
        next: (res) => {
          this.parseDataGridResponse(res);
          this.dataGridLoading = false;
          this.inlineDataLoaded = true;
          // Only run auto-pick if parseDataGridResponse didn't already
          // apply an LLM-generated chart config (which sets showChart = true).
          if (!this.showChart) {
            this.onVisualizeClick();
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[MessageBubble] Error loading data for chart:', err);
          this.dataGridLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  attachToConversation(): void {
    const id = this.message?.data_grid_id;
    if (id) {
      const name = this.fallbackDataGridTitle || `DataGrid #${id}`;
      const rowCount =
        typeof this.dataGridRecordCount === 'number'
          ? this.dataGridRecordCount
          : typeof this.dataGridRecordCount === 'string' &&
              this.dataGridRecordCount !== ''
            ? Number(this.dataGridRecordCount)
            : undefined;
      const cols = this.attachedDataGrid?.columns?.length
        ? this.attachedDataGrid.columns
        : this.activeSource?.columns?.length
          ? this.activeSource.columns
          : this.dataGridColumns?.length
            ? this.dataGridColumns
            : undefined;
      this.datagridAttachmentService.attachDataGrid(id, name, rowCount, cols);
    }
  }

  scrollToDatagrid(id: number): void {
    if (!id) return;
    const targetId = `datagrid-${id}`;
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add a visual flash effect to draw the user's eye
      targetElement.classList.add('highlight-flash');
      setTimeout(() => {
        targetElement.classList.remove('highlight-flash');
      }, 2000); // Same duration as the animation in SCSS
    }
  }

  /** Reads the datagrid attachment from a user or assistant message's metadata. */
  get attachedDataGrid(): {
    id: number;
    name: string;
    row_count?: number;
    columns?: string[];
  } | null {
    const dg = this.message?.metadata?.['attached_datagrid'];
    if (!dg || typeof dg !== 'object') return null;
    return dg as {
      id: number;
      name: string;
      row_count?: number;
      columns?: string[];
    };
  }

  /** First ≤4 column names joined for the card subtitle. */
  get datagridColumnsPreview(): string {
    const cols = this.attachedDataGrid?.columns;
    if (!cols?.length) return '';
    const preview = cols.slice(0, 4).join(', ');
    return cols.length > 4 ? preview + ', …' : preview;
  }

  get dataGridRecordCount(): number | string {
    if (this.message?.data_grid_row_count !== undefined) {
      return this.message.data_grid_row_count;
    }
    if (this.message?.metadata?.['row_count'] !== undefined) {
      return this.message.metadata['row_count'];
    }
    const grid = this.message?.metadata?.['data_grid'];
    if (grid && Array.isArray(grid)) {
      let count = 0;
      for (const sub of grid) {
        if (Array.isArray(sub)) count += sub.length;
        else count++;
      }
      return count;
    }
    return '';
  }

  get fallbackDataGridTitle(): string {
    const dg = this.attachedDataGrid;
    if (dg?.name) return dg.name;

    if (this.message?.data_grid_id) {
      return `DataGrid #${this.message.data_grid_id}`;
    }

    const sourceName =
      this.message?.metadata?.['source_name'] ||
      this.message?.metadata?.['table_name'];
    if (sourceName) {
      return sourceName
        .replace(/\.(xlsx|csv|xls|json|pdf)/gi, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
    }
    if (this.activeSource?.source_name) {
      return this.getSourceTabLabel(this.activeSource);
    }
    return 'Data Records';
  }

  get fallbackDataGridSubtitle(): string {
    const rows = this.dataGridRecordCount || 0;
    const totalRows =
      this.message?.metadata?.['total_rows'] ||
      this.message?.metadata?.['original_row_count'];

    let subtitle = `${rows} rows`;

    if (totalRows && Number(totalRows) > Number(rows)) {
      subtitle += ` · filtered from ${Number(totalRows).toLocaleString()}`;
    }
    return subtitle;
  }

  // ── Tab switching ─────────────────────────────────────────────────

  setActiveSource(index: number): void {
    if (index >= 0 && index < this.dataSources.length) {
      this.activeSourceIndex = index;
      this.searchQuery = '';
      this.currentPage = 1;
      this.columnVisibility = {};
      this.cdr.markForCheck();
    }
  }

  // ── Source display helpers ────────────────────────────────────────

  getSourceTabLabel(source: DataGridSource): string {
    const name = source.source_name
      .replace(/\.(xlsx|csv|xls|json|pdf)/gi, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    return name.length > 22 ? name.slice(0, 20) + '…' : name;
  }

  /**
   * Returns FontAwesome classes and a brand colour for a given source.
   * Detection priority:
   *  1. spreadsheet: prefix + file extension → Excel / CSV / generic sheet
   *  2. database: prefix + source_name keyword → PostgreSQL / ClickHouse / MySQL / etc.
   *  3. Fallback → table icon
   */
  getSourceIconInfo(source: DataGridSource): {
    classes: string[];
    color: string;
  } {
    const key = (source.source_key ?? '').toLowerCase();
    const name = (source.source_name ?? '').toLowerCase();

    // ── Spreadsheet / file sources ────────────────────────────────
    if (
      key.startsWith('spreadsheet:') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ) {
      return { classes: ['fa-regular', 'fa-file-excel'], color: '#217346' };
    }
    if (name.endsWith('.csv')) {
      return { classes: ['fa-solid', 'fa-file-csv'], color: '#0891b2' };
    }
    if (name.endsWith('.json')) {
      return { classes: ['fa-solid', 'fa-file-code'], color: '#f59e0b' };
    }
    if (name.endsWith('.pdf')) {
      return { classes: ['fa-regular', 'fa-file-pdf'], color: '#dc2626' };
    }

    // ── Database sources ─────────────────────────────────────────
    if (key.startsWith('database:')) {
      if (
        name.includes('postgres') ||
        name.includes('pg_') ||
        name.includes('supabase')
      ) {
        return { classes: ['fa-solid', 'fa-database'], color: '#336791' };
      }
      if (
        name.includes('clickhouse') ||
        name.includes('click_house') ||
        name.includes('clk')
      ) {
        return { classes: ['fa-solid', 'fa-database'], color: '#f5a623' };
      }
      if (name.includes('mysql') || name.includes('mariadb')) {
        return { classes: ['fa-solid', 'fa-database'], color: '#f29111' };
      }
      if (name.includes('mongo')) {
        return { classes: ['fa-solid', 'fa-database'], color: '#4db33d' };
      }
      if (name.includes('sqlite')) {
        return { classes: ['fa-solid', 'fa-database'], color: '#44a8e2' };
      }
      if (
        name.includes('mssql') ||
        name.includes('sql server') ||
        name.includes('sqlserver')
      ) {
        return { classes: ['fa-solid', 'fa-database'], color: '#cc2927' };
      }
      if (name.includes('oracle')) {
        return { classes: ['fa-solid', 'fa-database'], color: '#f80000' };
      }
      // Generic DB connection
      return { classes: ['fa-solid', 'fa-database'], color: '#6366f1' };
    }

    // ── Fallback ─────────────────────────────────────────────────
    return { classes: ['fa-solid', 'fa-table-cells'], color: '#3b82f6' };
  }

  formatSourceKey(key: string): string {
    // Truncate very long source keys for display
    return key && key.length > 60 ? key.slice(0, 58) + '…' : (key ?? '');
  }

  formatColumnHeader(key: string): string {
    // Replace underscores with spaces; CSS text-transform: uppercase handles casing
    return key.replace(/_/g, ' ');
  }

  // ── SQL highlighting ──────────────────────────────────────────────

  highlightSql(sql: string): SafeHtml {
    if (!sql) return this.sanitizer.bypassSecurityTrustHtml('');

    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'ORDER BY',
      'GROUP BY',
      'HAVING',
      'LIMIT',
      'OFFSET',
      'JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'INNER JOIN',
      'ON',
      'AND',
      'OR',
      'NOT',
      'IN',
      'BETWEEN',
      'LIKE',
      'IS NULL',
      'IS NOT NULL',
      'AS',
      'DISTINCT',
      'COUNT',
      'SUM',
      'AVG',
      'MAX',
      'MIN',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'UNION',
      'WITH',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'INTERVAL',
      'CURRENT_DATE',
    ];

    // Escape HTML
    let escaped = sql
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Highlight string literals first
    escaped = escaped.replace(
      /'([^']*)'/g,
      '<span class="sql-string">\'$1\'</span>',
    );

    // Highlight keywords (word boundaries, case-insensitive)
    const kwPattern = new RegExp(
      `\\b(${keywords.map((k) => k.replace(/ /g, '\\s+')).join('|')})\\b`,
      'gi',
    );
    escaped = escaped.replace(kwPattern, '<span class="sql-keyword">$1</span>');

    const sanitized = DOMPurify.sanitize(escaped, {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['class'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  // ── Modal actions ─────────────────────────────────────────────────

  previewDataGrid(downloadCsvAfter: boolean = false): void {
    // If we already have parsed sources, open modal directly
    if (this.dataSources.length > 0) {
      if (downloadCsvAfter) {
        this.exportCsv();
      } else {
        this.showDataGridModal = true;
      }
      return;
    }

    if (!this.conversationId || !this.message?.id) {
      console.error(
        '[MessageBubble] Cannot preview data grid: missing conversationId or message.id',
      );
      alert(
        'Cannot preview data grid: Conversation ID or Message ID is missing.',
      );
      return;
    }

    if (!downloadCsvAfter) {
      this.showDataGridModal = true;
      this.dataGridLoading = true;
    }

    this.conversationService
      .getDataGrid(this.conversationId, this.message.id)
      .subscribe({
        next: (res) => {
          this.parseDataGridResponse(res);
          this.dataGridLoading = false;
          this.inlineDataLoaded = true;
          this.cdr.markForCheck();

          if (downloadCsvAfter) {
            setTimeout(() => this.exportCsv(), 100);
          }
        },
        error: (err) => {
          console.error('[MessageBubble] Error loading data grid:', err);
          this.dataGridLoading = false;
          this.cdr.markForCheck();
          if (err.status === 404) {
            alert(
              'Data grid not found. It might be a temporary message or streaming is incomplete.',
            );
          }
        },
      });
  }

  closeDataGridModal(): void {
    this.showDataGridModal = false;
  }

  viewSql(sourceIndex?: number): void {
    const targetIndex = sourceIndex ?? 0;
    // If we already have data, just open the modal
    if (this.dataSources.length > 0) {
      this.sqlActiveSourceIndex = targetIndex;
      this.showSqlModal = true;
      return;
    }
    // Otherwise fetch first
    if (this.conversationId && this.message?.id) {
      this.conversationService
        .getDataGrid(this.conversationId, this.message.id)
        .subscribe({
          next: (res) => {
            this.parseDataGridResponse(res);
            this.sqlActiveSourceIndex = targetIndex;
            this.showSqlModal = true;
            this.cdr.markForCheck();
          },
        });
    } else {
      this.sqlActiveSourceIndex = targetIndex;
      this.showSqlModal = true;
    }
  }

  setSqlActiveSource(index: number): void {
    if (index >= 0 && index < this.dataSources.length) {
      this.sqlActiveSourceIndex = index;
      this.cdr.markForCheck();
    }
  }

  closeSqlModal(): void {
    this.showSqlModal = false;
  }

  async copyMessage(): Promise<void> {
    const textToCopy = this.displayContent || this.message.content || '';
    if (!textToCopy) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        this.fallbackCopy(textToCopy);
      }
      this.showCopiedFeedback();
    } catch (error) {
      console.error('Failed to copy message', error);
      this.fallbackCopy(textToCopy);
      this.showCopiedFeedback();
    }
  }

  private fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private showCopiedFeedback(): void {
    this.copied = true;
    this.cdr.markForCheck();
    if (this.copyResetTimeout) {
      clearTimeout(this.copyResetTimeout);
    }
    this.copyResetTimeout = setTimeout(() => {
      this.copied = false;
      this.cdr.markForCheck();
    }, 2000);
  }

  async copySql(): Promise<void> {
    const textToCopy = this.activeSqlQuery || '';
    if (!textToCopy) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        this.fallbackCopy(textToCopy);
      }
      this.showSqlCopiedFeedback();
    } catch (error) {
      console.error('Failed to copy SQL', error);
      this.fallbackCopy(textToCopy);
      this.showSqlCopiedFeedback();
    }
  }

  private showSqlCopiedFeedback(): void {
    this.sqlCopied = true;
    this.cdr.markForCheck();
    if (this.sqlCopyResetTimeout) {
      clearTimeout(this.sqlCopyResetTimeout);
    }
    this.sqlCopyResetTimeout = setTimeout(() => {
      this.sqlCopied = false;
      this.cdr.markForCheck();
    }, 2000);
  }

  exportCsv(): void {
    const src = this.activeSource;
    const rowsToExport =
      src?.rows ?? this.modalDataGridRows ?? this.dataGridRows;
    if (!rowsToExport || rowsToExport.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const sourceName = src?.source_name
      ? src.source_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'data_export';
    link.download = `${sourceName}_${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.showExportMenu = false;
  }

  exportJson(): void {
    const src = this.activeSource;
    const rowsToExport =
      src?.rows ?? this.modalDataGridRows ?? this.dataGridRows;
    if (!rowsToExport || rowsToExport.length === 0) return;

    const jsonString = JSON.stringify(rowsToExport, null, 2);
    const blob = new Blob([jsonString], {
      type: 'application/json;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const sourceName = src?.source_name
      ? src.source_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'data_export';
    link.download = `${sourceName}_${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.showExportMenu = false;
  }

  exportExcel(): void {
    const src = this.activeSource;
    const rowsToExport =
      src?.rows ?? this.modalDataGridRows ?? this.dataGridRows;
    if (!rowsToExport || rowsToExport.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    const sourceName = src?.source_name
      ? src.source_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'data_export';
    XLSX.writeFile(workbook, `${sourceName}_${new Date().getTime()}.xlsx`);
    this.showExportMenu = false;
  }

  onRerunClick(): void {
    if (this.rerunLoading) return;
    this.rerun.emit();
  }

  onPagerPrev(): void {
    if (this.pagerHasPrev) this.pagerPrev.emit();
  }

  onPagerNext(): void {
    if (this.pagerHasNext) this.pagerNext.emit();
  }

  getDocumentIds(message: any): string[] {
    if (!message.metadata || !message.metadata['used_document_ids']) return [];
    return Array.isArray(message.metadata['used_document_ids'])
      ? message.metadata['used_document_ids']
      : [];
  }

  // ── New Datagrid Feature Methods ─────────────────────────────────

  get visibleColumns(): string[] {
    if (!this.activeSource) return [];
    return this.activeSource.columns.filter(
      (col) => this.columnVisibility[col] !== false,
    );
  }

  get filteredRows(): any[] {
    if (!this.activeSource) return [];
    let rows = this.activeSource.rows;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      rows = rows.filter((row) => {
        return Object.values(row).some((val) =>
          String(val).toLowerCase().includes(q),
        );
      });
    }
    return rows;
  }

  get pagedRows(): any[] {
    const rows = this.filteredRows;
    const start = (this.currentPage - 1) * this.pageSize;
    return rows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredRows.length / this.pageSize) || 1;
  }

  get paginationStart(): number {
    if (this.filteredRows.length === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredRows.length);
  }

  toggleColumnMenu(event: Event): void {
    event.stopPropagation();
    this.showColumnMenu = !this.showColumnMenu;
    this.showDensityMenu = false;
    this.showExportMenu = false;
  }

  toggleDensityMenu(event: Event): void {
    event.stopPropagation();
    this.showDensityMenu = !this.showDensityMenu;
    this.showColumnMenu = false;
    this.showExportMenu = false;
  }

  toggleExportMenu(event: Event): void {
    event.stopPropagation();
    this.showExportMenu = !this.showExportMenu;
    this.showColumnMenu = false;
    this.showDensityMenu = false;
  }

  closeDropdowns(): void {
    this.showColumnMenu = false;
    this.showDensityMenu = false;
    this.showExportMenu = false;
  }

  toggleColumnVisibility(col: string, event: Event): void {
    event.stopPropagation();
    this.columnVisibility[col] = this.columnVisibility[col] === false;
    this.cdr.markForCheck();
  }

  setDensity(density: 'compact' | 'comfortable' | 'spacious'): void {
    this.density = density;
    this.showDensityMenu = false;
    this.cdr.markForCheck();
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
    this.currentPage = 1; // reset to first page on search
    this.cdr.markForCheck();
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.markForCheck();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.markForCheck();
    }
  }

  firstPage(): void {
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  lastPage(): void {
    this.currentPage = this.totalPages;
    this.cdr.markForCheck();
  }

  onPageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.pageSize = parseInt(select.value, 10);
    this.currentPage = 1;
    this.cdr.markForCheck();
  }
}
