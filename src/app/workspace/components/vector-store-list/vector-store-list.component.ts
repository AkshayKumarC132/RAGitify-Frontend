import { Component, Input, Output, EventEmitter } from '@angular/core';
import { VectorStore } from '../../../shared/models/vector-store.model';

@Component({
  selector: 'app-vector-store-list',
  templateUrl: './vector-store-list.component.html',
  styleUrls: ['./vector-store-list.component.scss']
})
export class VectorStoreListComponent {
  @Input() vectorStores: VectorStore[] = [];
  @Input() selectedVectorStore: VectorStore | null = null;
  /** Optional map of vector store id -> document count for display */
  @Input() documentCounts: Record<string, number> = {};
  @Output() vectorStoreSelected = new EventEmitter<VectorStore>();
  @Output() editRequested = new EventEmitter<VectorStore>();
  @Output() deleteRequested = new EventEmitter<VectorStore>();
  @Output() chatRequested = new EventEmitter<VectorStore>();
  @Output() statsRequested = new EventEmitter<VectorStore>();

  getDocCount(store: VectorStore): number {
    return this.documentCounts[store.id] ?? 0;
  }

  getProgressPercent(store: VectorStore): number {
    return 100; // Could be computed from processing docs; default full
  }

  isSystemStore(store: VectorStore): boolean {
    return !!store.is_system;
  }

  canEdit(store: VectorStore): boolean {
    return !this.isSystemStore(store);
  }

  canDelete(store: VectorStore): boolean {
    return !this.isSystemStore(store);
  }

  canViewStats(store: VectorStore): boolean {
    return store.vs_type !== 'SHARED';
  }

  getStoreTypeLabel(store: VectorStore): string {
    return store.vs_type || 'CUSTOM';
  }

  getStoreHint(store: VectorStore): string {
    if (store.vs_type === 'DEFAULT') {
      return 'Primary ingestion target for personal knowledge.';
    }
    if (store.vs_type === 'SHARED') {
      return 'Read-only shared surface. New ingestion is blocked by backend policy.';
    }
    return 'Custom library for scoped retrieval.';
  }

  getMetadataCount(store: VectorStore): number {
    return Object.keys(store.metadata || {}).length;
  }

  getCollectionLabel(store: VectorStore): string | null {
    if (!store.collection) {
      return null;
    }
    return store.collection.length > 12 ? `${store.collection.slice(0, 12)}...` : store.collection;
  }

  selectStore(store: VectorStore): void {
    this.vectorStoreSelected.emit(store);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  requestEdit(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canEdit(store)) {
      return;
    }
    this.editRequested.emit(store);
  }

  requestDelete(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canDelete(store)) {
      return;
    }
    this.deleteRequested.emit(store);
  }

  requestChat(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    this.chatRequested.emit(store);
  }

  requestStats(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canViewStats(store)) {
      return;
    }
    this.statsRequested.emit(store);
  }
}
