import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentAccessService } from '../../../shared/services/document-access.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';

@Component({
  selector: 'app-knowledge-section',
  templateUrl: './knowledge-section.component.html',
  styleUrls: ['./knowledge-section.component.scss']
})
export class KnowledgeSectionComponent implements OnInit, OnDestroy {
  vectorStores: VectorStore[] = [];
  documents: Document[] = [];
  selectedVectorStore: VectorStore | null = null;
  showUploadForm = false;
  showCreateVectorStoreForm = false;
  createVectorStoreForm: FormGroup;
  editVectorStoreForm: FormGroup;
  loadingStores = false;
  loadingDocuments = false;
  errorMessage = '';
  private statusPollSub?: Subscription;
  editingVectorStore: VectorStore | null = null;
  editingDocumentId: string | null = null;
  documentTitleControl = new FormControl('', [Validators.required, Validators.minLength(3)]);
  linkDocumentIdsControl = new FormControl('', [Validators.required]);
  linkDocumentsMessage = '';
  linkDocumentsError = '';
  linkingDocuments = false;

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private documentAccessService: DocumentAccessService,
    private fb: FormBuilder
  ) {
    this.createVectorStoreForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.editVectorStoreForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit(): void {
    this.loadVectorStores();
    this.loadDocuments();
    this.startStatusPolling();
  }

  ngOnDestroy(): void {
    this.statusPollSub?.unsubscribe();
  }

  loadVectorStores(): void {
    this.loadingStores = true;
    this.vectorStoreService.list().subscribe({
      next: (stores: VectorStore[]) => {
        this.vectorStores = stores;
        if (stores.length > 0 && !this.selectedVectorStore) {
          this.selectedVectorStore = stores[0];
        }
        this.loadingStores = false;
      },
      error: (err) => {
        console.error('Error loading library:', err);
        this.loadingStores = false;
      }
    });
  }

  loadDocuments(): void {
    this.loadingDocuments = true;
    this.documentService.list().subscribe({
      next: (docs: Document[]) => {
        this.documents = docs;
        this.loadingDocuments = false;
      },
      error: (err) => {
        console.error('Error loading documents:', err);
        this.loadingDocuments = false;
      }
    });
  }

  onVectorStoreSelected(store: VectorStore): void {
    this.selectedVectorStore = store;
    this.linkDocumentsMessage = '';
    this.linkDocumentsError = '';
    this.linkDocumentIdsControl.reset('');
  }

  onDocumentUploaded(): void {
    this.loadDocuments();
    this.showUploadForm = false;
    this.startStatusPolling();
  }

  toggleVectorStoreForm(): void {
    this.showCreateVectorStoreForm = !this.showCreateVectorStoreForm;
    if (!this.showCreateVectorStoreForm) {
      this.createVectorStoreForm.reset();
    }
  }

  startVectorStoreEdit(store: VectorStore): void {
    this.editingVectorStore = store;
    this.editVectorStoreForm.reset({ name: store.name });
  }

  cancelVectorStoreEdit(): void {
    this.editingVectorStore = null;
    this.editVectorStoreForm.reset();
  }

  updateVectorStore(): void {
    if (!this.editingVectorStore || this.editVectorStoreForm.invalid) {
      this.editVectorStoreForm.markAllAsTouched();
      return;
    }

    const { name } = this.editVectorStoreForm.value;
    this.vectorStoreService.update(this.editingVectorStore.id, { name }).subscribe({
      next: (updated) => {
        this.vectorStores = this.vectorStores.map(store =>
          store.id === updated.id ? { ...store, name: updated.name } : store
        );
        if (this.selectedVectorStore?.id === updated.id) {
          this.selectedVectorStore = { ...updated };
        }
        this.cancelVectorStoreEdit();
      },
      error: (err) => {
        console.error('Error updating library:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to update library.');
      }
    });
  }

  deleteVectorStore(store: VectorStore): void {
    if (!confirm(`Delete library "${store.name}"? This will remove its documents.`)) {
      return;
    }

    this.vectorStoreService.delete(store.id).subscribe({
      next: () => {
        this.vectorStores = this.vectorStores.filter(vs => vs.id !== store.id);
        if (this.selectedVectorStore?.id === store.id) {
          this.selectedVectorStore = this.vectorStores[0] || null;
        }
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error deleting library:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete library.');
      }
    });
  }

  createVectorStore(): void {
    if (this.createVectorStoreForm.invalid) {
      this.createVectorStoreForm.markAllAsTouched();
      return;
    }

    const { name } = this.createVectorStoreForm.value;
    this.vectorStoreService.create({ name }).subscribe({
      next: (store) => {
        this.vectorStores = [store, ...this.vectorStores];
        this.selectedVectorStore = store;
        this.toggleVectorStoreForm();
        this.errorMessage = '';
      },
      error: (err) => {
        console.error('Error creating library:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to create library.');
      }
    });
  }

  deleteDocument(documentId: string): void {
    if (!confirm('Delete this document? This cannot be undone.')) {
      return;
    }

    this.documentService.delete(documentId).subscribe({
      next: () => this.loadDocuments(),
      error: (err) => {
        console.error('Error deleting document:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete document.');
      }
    });
  }

  linkExistingDocuments(): void {
    if (!this.selectedVectorStore) {
      this.linkDocumentsError = 'Select a library before linking documents.';
      return;
    }

    if (this.linkDocumentIdsControl.invalid) {
      this.linkDocumentIdsControl.markAsTouched();
    }

    const parsedIds = this.parseDocumentIds(this.linkDocumentIdsControl.value || '');
    if (parsedIds.length === 0) {
      this.linkDocumentsError = 'Enter at least one valid document ID.';
      return;
    }

    this.linkDocumentsError = '';
    this.linkDocumentsMessage = '';
    this.linkingDocuments = true;

    this.documentAccessService.create({
      document_ids: parsedIds,
      vector_store_id: this.selectedVectorStore.id
    }).subscribe({
      next: (response) => {
        this.linkingDocuments = false;
        const message = (response as any)?.message || `${parsedIds.length} document(s) linked to ${this.selectedVectorStore?.name}.`;
        this.linkDocumentsMessage = message;
        this.linkDocumentIdsControl.reset('');
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error linking existing documents:', err);
        this.linkingDocuments = false;
        this.linkDocumentsError = this.extractErrorMessage(err, 'Unable to link existing documents.');
      }
    });
  }

  get filteredDocuments(): Document[] {
    if (!this.selectedVectorStore) {
      return this.documents;
    }
    return this.documents.filter(doc => doc.vector_store === this.selectedVectorStore?.id);
  }

  startDocumentRename(document: Document): void {
    this.editingDocumentId = document.id;
    this.documentTitleControl.setValue(document.title || '');
  }

  cancelDocumentRename(): void {
    this.editingDocumentId = null;
    this.documentTitleControl.reset('');
  }

  saveDocumentTitle(document: Document): void {
    if (this.documentTitleControl.invalid) {
      this.documentTitleControl.markAsTouched();
      return;
    }

    const title = this.documentTitleControl.value?.trim();
    this.documentService.update(document.id, { title }).subscribe({
      next: (updated) => {
        this.documents = this.documents.map(doc =>
          doc.id === updated.id ? { ...doc, title: updated.title } : doc
        );
        this.cancelDocumentRename();
      },
      error: (err) => {
        console.error('Error renaming document:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to rename document.');
      }
    });
  }

  getStatusBadgeClass(status: Document['status']): string {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      case 'in_progress':
        return 'status-in-progress';
      default:
        return 'status-queued';
    }
  }

  private startStatusPolling(): void {
    this.statusPollSub?.unsubscribe();
    this.statusPollSub = interval(5000).subscribe(() => {
      const hasPending = this.documents.some(doc =>
        doc.status === 'queued' || doc.status === 'in_progress'
      );
      if (hasPending) {
        this.loadDocuments();
      }
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  private parseDocumentIds(rawValue: string): string[] {
    return Array.from(new Set(
      rawValue
        .split(/[\s,]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0)
    ));
  }

  private extractErrorMessage(error: any, fallback: string): string {
    if (error?.error) {
      if (typeof error.error === 'string') {
        return error.error;
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
