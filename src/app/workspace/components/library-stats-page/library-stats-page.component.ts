import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Document } from '../../../shared/models/document.model';
import { VectorStore, VectorStoreStats } from '../../../shared/models/vector-store.model';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { WorkspaceLibraryDeleteFlowService } from '../../services/workspace-library-delete-flow.service';
import { SharedModule } from '../../../shared/shared.module';
import { LibraryChatComponent } from '../library-chat/library-chat.component';

@Component({
  selector: 'app-library-stats-page',
  templateUrl: './library-stats-page.component.html',
  styleUrls: ['./library-stats-page.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SharedModule, LibraryChatComponent]
})
export class LibraryStatsPageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() libraryId: string | null = null;

  loading = false;
  errorMessage = '';
  store: VectorStore | null = null;
  stats: VectorStoreStats | null = null;
  chatLibrary: VectorStore | null = null;
  renameTarget: VectorStore | null = null;
  renameName = '';
  private destroy$ = new Subject<void>();

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private libraryDeleteFlow: WorkspaceLibraryDeleteFlowService,
    private router: Router
  ) {}

  private readonly chartPalette = ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6'];
  private readonly ingestionStatusConfig: Array<{ key: string; label: string; aliases: string[]; color: string }> = [
    { key: 'completed', label: 'Completed', aliases: ['completed', 'complete'], color: '#2563eb' },
    { key: 'in_progress', label: 'In Progress', aliases: ['in_progress', 'inprogress', 'processing', 'queued', 'pending'], color: '#f59e0b' },
    { key: 'failed', label: 'Failed', aliases: ['failed', 'error'], color: '#ef4444' }
  ];

  ngOnInit(): void {
    this.knowledgeContext.editLibraryRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(store => this.startRename(store));

    this.knowledgeContext.deleteLibraryRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(store => {
        void this.deleteLibrary(store);
      });

    this.knowledgeContext.chatLibraryRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(store => {
        this.openLibraryChat(store);
      });

    this.loadStatsPage();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['libraryId'] && !changes['libraryId'].firstChange) {
      this.loadStatsPage();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get storeMetadataEntries(): Array<{ key: string; value: string }> {
    return Object.entries(this.store?.metadata || {}).map(([key, value]) => ({
      key,
      value: this.formatMetadataValue(value)
    }));
  }

  get overviewCards(): Array<{ label: string; value: string; tone?: 'primary' | 'neutral' }> {
    return [
      { label: 'Documents', value: this.formatNumber(this.stats?.document_count ?? 0), tone: 'primary' },
      { label: 'Vector Points', value: this.formatNumber(this.stats?.vector_points ?? 0), tone: 'primary' },
      { label: 'Total File Size', value: this.formatBytes(this.stats?.total_file_size ?? 0), tone: 'neutral' },
      { label: 'Library Type', value: this.stats?.vs_type || this.store?.vs_type || 'CUSTOM', tone: 'neutral' }
    ];
  }

  get insightRows(): Array<{ label: string; value: string; helper: string }> {
    const documentCount = this.stats?.document_count ?? 0;
    const vectorPoints = this.stats?.vector_points ?? 0;
    const totalFileSize = this.stats?.total_file_size ?? 0;
    const averageFileSize = documentCount > 0 ? totalFileSize / documentCount : 0;
    const pointsPerDocument = documentCount > 0 ? vectorPoints / documentCount : 0;

    return [
      {
        label: 'Average File Size',
        value: this.formatBytes(averageFileSize),
        helper: documentCount > 0 ? 'Average across indexed documents' : 'No indexed documents yet'
      },
      {
        label: 'Points Per Document',
        value: pointsPerDocument.toFixed(pointsPerDocument >= 10 ? 0 : 1),
        helper: documentCount > 0 ? 'Embedding density signal' : 'Waiting for document ingestion'
      },
      {
        label: 'Metadata Fields',
        value: String(this.storeMetadataEntries.length),
        helper: this.storeMetadataEntries.length > 0 ? 'Custom library descriptors saved' : 'No custom metadata defined'
      }
    ];
  }

  get storeDetailRows(): Array<{ label: string; value: string; mono?: boolean }> {
    if (!this.store) {
      return [];
    }

    return [
      { label: 'Library ID', value: this.store.id || '-', mono: true },
      { label: 'Library Name', value: this.store.name || '-' },
      { label: 'Created', value: this.formatDateTime(this.store.created_at) },
      { label: 'Updated', value: this.formatDateTime(this.store.updated_at) },
      { label: 'System Library', value: this.store.is_system ? 'Yes' : 'No' },
      { label: 'Owner', value: String(this.store.user ?? '-') }
    ];
  }

  get ingestionBreakdownEntries(): Array<{ key: string; value: number; label: string; color: string; percent: number }> {
    const source = this.stats?.ingestion_status_breakdown || {};
    const total = this.ingestionStatusConfig.reduce((sum, status) => sum + this.resolveStatusValue(source, status.aliases), 0);

    return this.ingestionStatusConfig.map(status => {
      const value = this.resolveStatusValue(source, status.aliases);
      return {
        key: status.key,
        label: status.label,
        color: status.color,
        value,
        percent: total > 0 ? (value / total) * 100 : 0
      };
    });
  }

  get fileTypeBreakdownEntries(): Array<{ key: string; value: number }> {
    return this.toSortedEntries(this.stats?.file_type_breakdown);
  }

  get fileTypeChartEntries(): Array<{ key: string; value: number; percent: number; color: string }> {
    return this.toChartEntries(this.fileTypeBreakdownEntries);
  }

  get fileTypeChartBackground(): string {
    return this.toConicGradient(this.fileTypeChartEntries);
  }

  get hasIngestionBreakdown(): boolean {
    return this.ingestionBreakdownEntries.some(entry => entry.value > 0);
  }

  get hasFileTypeBreakdown(): boolean {
    return this.fileTypeChartEntries.length > 0;
  }

  trackByKey(_: number, entry: { key: string; value: number } | { key: string; value: string }): string {
    return entry.key;
  }

  formatBytes(bytes: number): string {
    if (!bytes) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
  }

  formatNumber(value: number): string {
    return value.toLocaleString('en-US');
  }

  formatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  openLibraryChat(store: VectorStore): void {
    this.chatLibrary = store;
  }

  closeLibraryChat(): void {
    this.chatLibrary = null;
  }

  startRename(store: VectorStore): void {
    this.renameTarget = store;
    this.renameName = store.name || '';
  }

  cancelRename(): void {
    this.renameTarget = null;
    this.renameName = '';
  }

  confirmRename(): void {
    if (!this.renameTarget) {
      return;
    }

    const trimmed = this.renameName.trim();
    if (!trimmed) {
      return;
    }

    const target = this.renameTarget;
    this.vectorStoreService.update(target.id, { name: trimmed }).subscribe({
      next: updated => {
        if (this.store?.id === updated.id) {
          this.store = { ...this.store, ...updated };
        }
        this.syncContextStoreUpdate(updated);
        this.cancelRename();
      },
      error: error => {
        this.errorMessage = this.extractErrorMessage(error, 'Unable to rename library.');
      }
    });
  }

  async deleteLibrary(store: VectorStore): Promise<void> {
    const documents = await this.loadAllDocumentsForDeleteFlow();
    const vectorStores = this.knowledgeContext.currentState.vectorStores;

    await this.libraryDeleteFlow.openDeleteLibraryFlow(store, vectorStores, documents, {
      onDeleted: () => {
        this.syncContextStoreDelete(store.id);
        if (this.chatLibrary?.id === store.id) {
          this.chatLibrary = null;
        }
        if (this.renameTarget?.id === store.id) {
          this.cancelRename();
        }
        if (this.store?.id === store.id) {
          this.router.navigate(['/workspace']);
          return;
        }
        this.loadStatsPage();
      }
    });
  }

  private loadStatsPage(): void {
    if (!this.libraryId) {
      this.store = null;
      this.stats = null;
      this.errorMessage = 'No library was selected.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      store: this.vectorStoreService.getById(this.libraryId),
      stats: this.vectorStoreService.getStats(this.libraryId)
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ store, stats }) => {
          if (store.vs_type === 'SHARED') {
            this.store = null;
            this.stats = null;
            this.errorMessage = 'Shared libraries do not expose analytics.';
            this.loading = false;
            return;
          }
          this.store = store;
          this.stats = stats;
          this.loading = false;
        },
        error: (error) => {
          this.store = null;
          this.stats = null;
          this.errorMessage = this.extractErrorMessage(error, 'Unable to load library analytics.');
          this.loading = false;
        }
      });
  }

  private toSortedEntries(source: Record<string, number> | null | undefined): Array<{ key: string; value: number }> {
    return Object.entries(source || {})
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .map(([key, value]) => ({ key, value }));
  }

  private toChartEntries(entries: Array<{ key: string; value: number }>): Array<{ key: string; value: number; percent: number; color: string }> {
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    return entries.map((entry, index) => ({
      ...entry,
      percent: total > 0 ? (entry.value / total) * 100 : 0,
      color: this.chartPalette[index % this.chartPalette.length]
    }));
  }

  private toConicGradient(entries: Array<{ percent: number; color: string }>): string {
    if (!entries.length) {
      return 'conic-gradient(rgba(148, 163, 184, 0.18) 0deg 360deg)';
    }

    let current = 0;
    const stops = entries.map(entry => {
      const start = current;
      current += (entry.percent / 100) * 360;
      return `${entry.color} ${start}deg ${current}deg`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  }

  private resolveStatusValue(source: Record<string, number>, aliases: string[]): number {
    return aliases.reduce((sum, alias) => sum + (source[alias] || 0), 0);
  }

  private async loadAllDocumentsForDeleteFlow(): Promise<Document[]> {
    return new Promise(resolve => {
      this.documentService.list(undefined, false).pipe(takeUntil(this.destroy$)).subscribe({
        next: documents => resolve(documents),
        error: () => resolve([])
      });
    });
  }

  private syncContextStoreUpdate(updated: VectorStore): void {
    const current = this.knowledgeContext.currentState;
    const vectorStores = current.vectorStores.map(store =>
      store.id === updated.id ? { ...store, ...updated } : store
    );
    const selectedVectorStore = current.selectedVectorStore?.id === updated.id
      ? { ...current.selectedVectorStore, ...updated }
      : current.selectedVectorStore;

    this.knowledgeContext.updateState({
      vectorStores,
      selectedVectorStore
    });
  }

  private syncContextStoreDelete(storeId: string): void {
    const current = this.knowledgeContext.currentState;
    const vectorStores = current.vectorStores.filter(store => store.id !== storeId);
    const selectedVectorStore = current.selectedVectorStore?.id === storeId
      ? null
      : current.selectedVectorStore;
    const documentCounts = { ...current.documentCounts };
    delete documentCounts[storeId];

    this.knowledgeContext.updateState({
      vectorStores,
      selectedVectorStore,
      documentCounts
    });
  }

  private formatMetadataValue(value: unknown): string {
    if (value == null) {
      return '-';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const candidate = error as { error?: { detail?: string; message?: string }; message?: string };
    return candidate?.error?.detail || candidate?.error?.message || candidate?.message || fallback;
  }
}
