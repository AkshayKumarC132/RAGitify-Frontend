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

  getDocCount(store: VectorStore): number {
    return this.documentCounts[store.id] ?? 0;
  }

  getProgressPercent(store: VectorStore): number {
    return 100; // Could be computed from processing docs; default full
  }

  selectStore(store: VectorStore): void {
    this.vectorStoreSelected.emit(store);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  requestEdit(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    this.editRequested.emit(store);
  }

  requestDelete(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteRequested.emit(store);
  }

  requestChat(store: VectorStore, event: MouseEvent): void {
    event.stopPropagation();
    this.chatRequested.emit(store);
  }
}
