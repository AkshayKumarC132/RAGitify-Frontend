import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
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
  loadingStores = false;
  loadingDocuments = false;
  errorMessage = '';
  private statusPollSub?: Subscription;

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private fb: FormBuilder
  ) {
    this.createVectorStoreForm = this.fb.group({
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

  get filteredDocuments(): Document[] {
    if (!this.selectedVectorStore) {
      return this.documents;
    }
    return this.documents.filter(doc => doc.vector_store === this.selectedVectorStore?.id);
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
