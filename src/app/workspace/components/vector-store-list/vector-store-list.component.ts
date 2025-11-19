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
  @Output() vectorStoreSelected = new EventEmitter<VectorStore>();

  selectStore(store: VectorStore): void {
    this.vectorStoreSelected.emit(store);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }
}
