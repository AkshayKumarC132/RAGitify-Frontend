import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { VectorStore } from '../../../shared/models/vector-store.model';

@Component({
  selector: 'app-workspace-library-picker',
  templateUrl: './workspace-library-picker.component.html',
  styleUrls: ['./workspace-library-picker.component.scss']
})
export class WorkspaceLibraryPickerComponent implements OnInit {
  vectorStores: VectorStore[] = [];
  documentCounts: Record<string, number> = {};
  loading = true;
  errorMessage = '';
  gridView = true;
  searchQuery = '';
  renameTarget: VectorStore | null = null;
  renameName = '';

  get filteredVectorStores(): VectorStore[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.vectorStores;
    return this.vectorStores.filter(s => (s.name || '').toLowerCase().includes(q));
  }

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private confirmDialogService: ConfirmDialogService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadLibraries();
  }

  loadLibraries(): void {
    this.loading = true;
    this.errorMessage = '';
    this.vectorStoreService.list(true).subscribe({
      next: (stores) => {
        this.vectorStores = stores;
        this.loadDocumentCounts();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading libraries:', err);
        this.errorMessage = 'Unable to load libraries.';
        this.loading = false;
      }
    });
  }

  private loadDocumentCounts(): void {
    this.documentService.list(undefined, false).subscribe({
      next: (docs) => {
        const counts: Record<string, number> = {};
        docs.forEach(d => {
          counts[d.vector_store] = (counts[d.vector_store] || 0) + 1;
        });
        this.documentCounts = counts;
      }
    });
  }

  getDocCount(store: VectorStore): number {
    return this.documentCounts[store.id] ?? 0;
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  selectLibrary(store: VectorStore): void {
    this.router.navigate(['/workspace'], { queryParams: { libraryId: store.id } });
  }

  setGridView(value: boolean): void {
    this.gridView = value;
  }

  editLibrary(store: VectorStore): void {
    this.renameTarget = store;
    this.renameName = store.name || '';
    this.errorMessage = '';
  }

  cancelRename(): void {
    this.renameTarget = null;
    this.renameName = '';
  }

  confirmRename(): void {
    if (!this.renameTarget) {
      return;
    }
    const trimmed = (this.renameName || '').trim();
    if (!trimmed) {
      return;
    }

    const target = this.renameTarget;
    this.vectorStoreService.update(target.id, { name: trimmed }).subscribe({
      next: (updated) => {
        this.vectorStores = this.vectorStores.map(s => (s.id === updated.id ? { ...s, name: updated.name } : s));
        this.cancelRename();
      },
      error: (err) => {
        console.error('Error renaming library:', err);
        this.errorMessage = 'Unable to rename library.';
      }
    });
  }

  deleteLibrary(store: VectorStore): void {
    this.confirmDialogService.confirm({
      title: 'Delete library?',
      message: 'This will delete',
      itemName: store.name,
      secondaryMessage: 'All documents and data in this library will be removed.',
      type: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).then(confirmed => {
      if (!confirmed) return;
      this.vectorStoreService.delete(store.id).subscribe({
        next: () => {
          this.vectorStores = this.vectorStores.filter(s => s.id !== store.id);
          this.loadDocumentCounts();
        },
        error: (err) => {
          console.error('Error deleting library:', err);
          this.errorMessage = 'Unable to delete library.';
        }
      });
    }).catch(() => {});
  }
}
