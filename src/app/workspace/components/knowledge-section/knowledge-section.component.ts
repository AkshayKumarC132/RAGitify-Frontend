import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval, of } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document, DocumentStatus } from '../../../shared/models/document.model';

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
  private statusCheckInFlight = new Set<string>();
  editingVectorStore: VectorStore | null = null;
  editingDocumentId: string | null = null;
  documentTitleControl = new FormControl('', [Validators.required, Validators.minLength(3)]);
  chatDocument: Document | null = null;
  chatLibrary: VectorStore | null = null;

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private confirmDialogService: ConfirmDialogService,
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
  }

  onDocumentUploaded(): void {
    this.loadDocuments();
    this.showUploadForm = false;
    this.showCreateVectorStoreForm = false;
    this.startStatusPolling();
  }

  toggleVectorStoreForm(): void {
    this.showCreateVectorStoreForm = !this.showCreateVectorStoreForm;
    if (this.showCreateVectorStoreForm) {
      this.showUploadForm = false;
    }
    if (!this.showCreateVectorStoreForm) {
      this.createVectorStoreForm.reset();
    }
  }

  toggleUploadForm(): void {
    this.showUploadForm = !this.showUploadForm;
    if (this.showUploadForm) {
      this.showCreateVectorStoreForm = false;
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

  async deleteVectorStore(store: VectorStore): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete library?',
      message: 'This will delete',
      itemName: store.name,
      secondaryMessage: 'Note: This will remove all threads and documents associated with this library.'
    });
    if (!confirmed) {
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

  async deleteDocument(documentId: string): Promise<void> {
    const document = this.documents.find(doc => doc.id === documentId);
    const documentName = document?.title || 'this document';

    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete document?',
      message: 'This will delete',
      itemName: documentName,
      secondaryMessage: 'This cannot be undone.'
    });
    if (!confirmed) {
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
      case 'processing':
        return 'status-in-progress';
      default:
        return 'status-queued';
    }
  }

  private startStatusPolling(): void {
    this.statusPollSub?.unsubscribe();
    this.statusPollSub = interval(5000).subscribe(() => {
      const pendingDocuments = this.documents.filter(doc =>
        doc.status === 'queued' || doc.status === 'in_progress' || doc.status === 'processing'
      );

      if (!pendingDocuments.length && this.statusCheckInFlight.size === 0) {
        this.statusPollSub?.unsubscribe();
        return;
      }

      pendingDocuments.forEach(doc => {
        if (this.statusCheckInFlight.has(doc.id)) {
          return;
        }
        this.statusCheckInFlight.add(doc.id);
        this.documentService.getStatus(doc.id).pipe(
          timeout(10000),
          catchError(err => {
            console.error('Error loading document status:', err);
            return of(null as DocumentStatus | null);
          }),
          finalize(() => {
            this.statusCheckInFlight.delete(doc.id);
          })
        ).subscribe({
          next: (status: DocumentStatus | null) => {
            if (status) {
              this.updateDocumentStatus(status);
            }
          }
        });
      });
    });
  }

  private updateDocumentStatus(status: DocumentStatus): void {
    const docIndex = this.documents.findIndex(doc => doc.id === status.document_id);
    if (docIndex === -1) {
      return;
    }
    const doc = this.documents[docIndex];
    if (doc.status === status.status) {
      return;
    }
    const next = [...this.documents];
    next[docIndex] = { ...doc, status: status.status };
    this.documents = next;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  openDocumentChat(document: Document): void {
    this.chatDocument = document;
  }

  closeDocumentChat(): void {
    this.chatDocument = null;
  }

  openLibraryChat(store: VectorStore): void {
    this.chatLibrary = store;
  }

  closeLibraryChat(): void {
    this.chatLibrary = null;
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
