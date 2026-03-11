import { Component, OnInit } from '@angular/core';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { Router } from '@angular/router';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';

@Component({
  selector: 'app-workspace-library-picker',
  templateUrl: './workspace-library-picker.component.html',
  styleUrls: ['./workspace-library-picker.component.scss']
})
export class WorkspaceLibraryPickerComponent implements OnInit {
  vectorStores: VectorStore[] = [];
  documents: Document[] = [];
  documentCounts: Record<string, number> = {};
  failedCounts: Record<string, number> = {};
  processingCounts: Record<string, number> = {};
  accessedCounts: Record<string, number> = {};
  loading = true;
  errorMessage = '';
  gridView = false;
  searchQuery = '';
  renameTarget: VectorStore | null = null;
  renameName = '';
  creating = false;
  createName = '';

  get filteredVectorStores(): VectorStore[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.vectorStores;
    return this.vectorStores.filter(s => {
      const haystack = [
        s.name,
        s.vs_type,
        s.collection,
        this.getStoreHint(s)
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  get totalDocuments(): number {
    return this.documents.length;
  }

  get totalFailedDocuments(): number {
    return this.documents.filter(doc => this.getResolvedStatus(doc) === 'failed').length;
  }

  get totalProcessingDocuments(): number {
    return this.documents.filter(doc => ['queued', 'processing', 'in_progress'].includes(this.getResolvedStatus(doc))).length;
  }

  get totalAccessedDocuments(): number {
    return this.documents.filter(doc => doc.access_type === 'shared').length;
  }

  get systemLibraryCount(): number {
    return this.vectorStores.filter(store => !!store.is_system).length;
  }

  get customLibraryCount(): number {
    return this.vectorStores.filter(store => !store.is_system).length;
  }

  get sharedLibraryCount(): number {
    return this.vectorStores.filter(store => store.vs_type === 'SHARED').length;
  }

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
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
        const failed: Record<string, number> = {};
        const processing: Record<string, number> = {};
        const accessed: Record<string, number> = {};
        docs.forEach(doc => {
          counts[doc.vector_store] = (counts[doc.vector_store] || 0) + 1;
          const status = this.getResolvedStatus(doc);
          if (status === 'failed') {
            failed[doc.vector_store] = (failed[doc.vector_store] || 0) + 1;
          }
          if (['queued', 'processing', 'in_progress'].includes(status)) {
            processing[doc.vector_store] = (processing[doc.vector_store] || 0) + 1;
          }
          if (doc.access_type === 'shared') {
            accessed[doc.vector_store] = (accessed[doc.vector_store] || 0) + 1;
          }
        });
        this.documents = docs;
        this.documentCounts = counts;
        this.failedCounts = failed;
        this.processingCounts = processing;
        this.accessedCounts = accessed;
      }
    });
  }

  getDocCount(store: VectorStore): number {
    return this.documentCounts[store.id] ?? 0;
  }

  getFailedCount(store: VectorStore): number {
    return this.failedCounts[store.id] ?? 0;
  }

  getProcessingCount(store: VectorStore): number {
    return this.processingCounts[store.id] ?? 0;
  }

  getAccessedCount(store: VectorStore): number {
    return this.accessedCounts[store.id] ?? 0;
  }

  getMetadataCount(store: VectorStore): number {
    return Object.keys(store.metadata || {}).length;
  }

  getCollectionLabel(store: VectorStore): string {
    return store.collection || 'No collection mapped';
  }

  getStoreTypeLabel(store: VectorStore): string {
    return store.vs_type || 'CUSTOM';
  }

  getStoreHint(store: VectorStore): string {
    if (store.vs_type === 'DEFAULT') {
      return 'Primary ingestion target for personal knowledge and chat attachments.';
    }
    if (store.vs_type === 'SHARED') {
      return 'Shared retrieval surface. Upload and destructive actions are blocked.';
    }
    return 'Custom library for scoped retrieval, team content, and dedicated ingestion flows.';
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
    if (!this.canEdit(store)) {
      return;
    }
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
    if (!this.canDelete(store)) {
      return;
    }
    void this.openDeleteLibraryFlow(store);
  }

  createLibrary(): void {
    this.creating = true;
    this.createName = '';
    this.errorMessage = '';
  }

  cancelCreateLibrary(): void {
    this.creating = false;
    this.createName = '';
  }

  confirmCreateLibrary(): void {
    const trimmed = (this.createName || '').trim();
    if (!trimmed) {
      return;
    }

    this.vectorStoreService.create({ name: trimmed }).subscribe({
      next: (store) => {
        this.vectorStores = [store, ...this.vectorStores];
        this.createName = '';
        this.creating = false;
        this.loadDocumentCounts();
      },
      error: (err) => {
        console.error('Error creating library:', err);
        this.errorMessage = 'Unable to create library.';
      }
    });
  }

  private getResolvedStatus(document: Document): string {
    return document.ingestion_status || document.status || 'queued';
  }

  private async openDeleteLibraryFlow(store: VectorStore): Promise<void> {
    const documentCount = this.getDocCount(store);
    const moveTargets = this.vectorStores.filter(target =>
      target.id !== store.id &&
      target.vs_type !== 'SHARED'
    );

    if (documentCount === 0) {
      const confirm = await Swal.fire({
        title: `Delete ${store.name}?`,
        text: 'This library is empty and will be removed immediately.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete library',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc2626'
      });
      if (confirm.isConfirmed) {
        this.executeDeleteLibrary(store, false);
      }
      return;
    }

    const moveTargetOptions = moveTargets
      .map(target => `<option value="${target.id}">${target.name} (${this.getStoreTypeLabel(target)})</option>`)
      .join('');

    const result = await Swal.fire({
      title: `Delete ${store.name}?`,
      icon: 'warning',
      width: 560,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      customClass: {
        popup: 'ragitify-swal-popup',
        htmlContainer: 'ragitify-swal-html',
        actions: 'ragitify-swal-actions',
        confirmButton: 'ragitify-swal-confirm',
        cancelButton: 'ragitify-swal-cancel'
      },
      html: `
        <div class="library-delete-modal">
          <p class="library-delete-copy">
            <strong>${documentCount}</strong> document${documentCount === 1 ? '' : 's'} are still inside this library.
          </p>
          <label class="library-delete-option">
            <input type="radio" name="library-delete-action" value="move" ${moveTargets.length ? 'checked' : 'disabled'}>
            <span>Move documents to another library, then delete this library</span>
          </label>
          <div class="library-delete-move">
            <select id="libraryDeleteTarget" class="swal2-select" ${moveTargets.length ? '' : 'disabled'}>
              <option value="">Select destination</option>
              ${moveTargetOptions}
            </select>
          </div>
          <label class="library-delete-option">
            <input type="radio" name="library-delete-action" value="hard-delete" ${moveTargets.length ? '' : 'checked'}>
            <span>Delete this library and permanently remove all documents inside it</span>
          </label>
          <label class="library-delete-checkbox">
            <input id="libraryDeleteAcknowledge" type="checkbox">
            <span>I understand documents in this library will be deleted and cannot be recovered.</span>
          </label>
        </div>
      `,
      didOpen: () => {
        const container = Swal.getHtmlContainer();
        if (!container) {
          return;
        }
        const moveRadio = container.querySelector<HTMLInputElement>('input[value="move"]');
        const hardDeleteRadio = container.querySelector<HTMLInputElement>('input[value="hard-delete"]');
        const moveSelect = container.querySelector<HTMLSelectElement>('#libraryDeleteTarget');
        const acknowledge = container.querySelector<HTMLInputElement>('#libraryDeleteAcknowledge');
        const syncState = () => {
          if (!moveSelect || !acknowledge || !moveRadio || !hardDeleteRadio) {
            return;
          }
          const moving = moveRadio.checked;
          moveSelect.disabled = !moving;
          acknowledge.disabled = moving;
          if (moving) {
            acknowledge.checked = false;
          }
        };
        moveRadio?.addEventListener('change', syncState);
        hardDeleteRadio?.addEventListener('change', syncState);
        syncState();
      },
      preConfirm: () => {
        const container = Swal.getHtmlContainer();
        if (!container) {
          return null;
        }
        const selectedAction = container.querySelector<HTMLInputElement>('input[name="library-delete-action"]:checked')?.value;
        const moveTargetId = (container.querySelector<HTMLSelectElement>('#libraryDeleteTarget')?.value || '').trim();
        const acknowledge = !!container.querySelector<HTMLInputElement>('#libraryDeleteAcknowledge')?.checked;

        if (selectedAction === 'move') {
          if (!moveTargetId) {
            Swal.showValidationMessage('Select a destination library before continuing.');
            return null;
          }
          return { action: 'move', moveTargetId };
        }

        if (!acknowledge) {
          Swal.showValidationMessage('Confirm that deleting this library will also remove its documents.');
          return null;
        }

        return { action: 'hard-delete', moveTargetId: null };
      }
    });

    if (!result.isConfirmed || !result.value) {
      return;
    }

    if (result.value.action === 'move' && result.value.moveTargetId) {
      this.moveDocumentsAndDeleteLibrary(store, result.value.moveTargetId);
      return;
    }

    this.executeDeleteLibrary(store, true);
  }

  private moveDocumentsAndDeleteLibrary(store: VectorStore, targetStoreId: string): void {
    const documentsToMove = this.documents.filter(document => document.vector_store === store.id);
    if (!documentsToMove.length) {
      this.executeDeleteLibrary(store, false);
      return;
    }

    void Swal.fire({
      title: 'Moving documents',
      text: 'Requesting a server-side move before deleting this library.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.documentService.move({
      document_ids: documentsToMove.map(document => document.id),
      target_vector_store_id: targetStoreId
    }).subscribe({
      next: () => {
        this.executeDeleteLibrary(store, false, 'Documents moved successfully. Library removed.');
      },
      error: (err) => {
        console.error('Error moving documents:', err);
        void Swal.fire({
          title: 'Unable to move documents',
          text: this.extractErrorMessage(err, 'The selected library could not be deleted because the document move failed.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  private executeDeleteLibrary(store: VectorStore, hardDelete: boolean, successMessage?: string): void {
    void Swal.fire({
      title: hardDelete ? 'Deleting library and documents' : 'Deleting library',
      text: hardDelete ? 'Removing the library and all of its documents.' : 'Removing the library now.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.vectorStoreService.delete(store.id, { hardDelete }).subscribe({
      next: () => {
        this.vectorStores = this.vectorStores.filter(s => s.id !== store.id);
        this.loadDocumentCounts();
        void Swal.fire({
          title: 'Library deleted',
          text: successMessage || `${store.name} was deleted successfully.`,
          icon: 'success',
          confirmButtonText: 'Close'
        });
      },
      error: (err) => {
        console.error('Error deleting library:', err);
        void Swal.fire({
          title: 'Unable to delete library',
          text: this.extractErrorMessage(err, 'The library could not be deleted.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  private extractErrorMessage(error: any, fallback: string): string {
    if (error?.error) {
      if (typeof error.error === 'string') {
        return error.error;
      }
      if (typeof error.error?.detail === 'string') {
        return error.error.detail;
      }
      if (typeof error.error?.error === 'string') {
        return error.error.error;
      }
      if (typeof error.error === 'object') {
        const firstKey = Object.keys(error.error)[0];
        if (firstKey) {
          const value = error.error[firstKey];
          if (Array.isArray(value)) {
            return value.join(', ');
          }
          if (typeof value === 'string') {
            return value;
          }
        }
      }
    }
    return fallback;
  }
}
