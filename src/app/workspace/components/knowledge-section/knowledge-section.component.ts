import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval, of, Subject, forkJoin } from 'rxjs';
import { catchError, filter, finalize, takeUntil, timeout } from 'rxjs/operators';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentAccessService } from '../../../shared/services/document-access.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document, DocumentStatus } from '../../../shared/models/document.model';
import { DocumentAccess } from '../../../shared/models/document-access.model';

@Component({
  selector: 'app-knowledge-section',
  templateUrl: './knowledge-section.component.html',
  styleUrls: ['./knowledge-section.component.scss']
})
export class KnowledgeSectionComponent implements OnInit, OnDestroy {
  vectorStores: VectorStore[] = [];
  documents: Document[] = [];
  documentAccessList: DocumentAccess[] = [];
  /** Full document list (all libraries). Loaded lazily for "Accessed". */
  allDocuments: Document[] = [];
  private allDocumentsLoaded = false;
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
  selectedDocumentIds = new Set<string>();
  searchQuery = '';
  statusFilter = '';
  selectionMode = false;
  isInWorkspace = false;
  listView = true; // list vs grid
  activeTypeFilter: 'all' | 'uploaded' | 'accessed' = 'all';
  activeStatusFilter: 'all' | 'finished' | 'processing' | 'failed' = 'all';
  openActionsDocId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private documentAccessService: DocumentAccessService,
    private confirmDialogService: ConfirmDialogService,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.createVectorStoreForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.editVectorStoreForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit(): void {
    this.isInWorkspace = this.router.url.includes('/workspace');
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => {
        this.isInWorkspace = this.router.url.includes('/workspace');
      });

    this.loadVectorStores(true);
    this.startStatusPolling();

    if (this.isInWorkspace) {
      this.knowledgeContext.state$
        .pipe(takeUntil(this.destroy$))
        .subscribe(state => {
          const urlLibraryId = this.route.snapshot.queryParamMap.get('libraryId');
          if (urlLibraryId && !state.selectedVectorStore) {
            return;
          }
          if (state.selectedVectorStore?.id !== this.selectedVectorStore?.id) {
            this.selectedVectorStore = state.selectedVectorStore;
            this.updateUrl(state.selectedVectorStore?.id || '');
            this.loadDocuments();
          }
        });
      this.knowledgeContext.openUploadPanel.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.showUploadForm = true;
        this.showCreateVectorStoreForm = false;
      });
      this.knowledgeContext.openNewLibraryPanel.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.showCreateVectorStoreForm = true;
        this.showUploadForm = false;
      });
      this.knowledgeContext.editLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
        this.startVectorStoreEdit(store);
      });
      this.knowledgeContext.deleteLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
        this.deleteVectorStore(store);
      });
      this.knowledgeContext.chatLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
        this.openLibraryChat(store);
      });
    }

    this.route.queryParamMap.subscribe(params => {
      const libraryId = params.get('libraryId');
      if (libraryId && libraryId !== this.selectedVectorStore?.id) {
        const store = this.vectorStores.find(vs => vs.id === libraryId);
        if (store) {
          this.selectedVectorStore = store;
          this.selectedDocumentIds.clear();
          this.searchQuery = '';
          this.statusFilter = '';
          this.selectionMode = false;
          this.loadDocuments();
          if (this.isInWorkspace) {
            this.knowledgeContext.setSelectedStore(store);
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.statusPollSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncContextState(): void {
    if (!this.isInWorkspace) return;
    this.documentService.list(undefined, false).subscribe(allDocs => {
      const documentCounts: Record<string, number> = {};
      allDocs.forEach(d => {
        documentCounts[d.vector_store] = (documentCounts[d.vector_store] || 0) + 1;
      });
      this.knowledgeContext.updateState({
        vectorStores: this.vectorStores,
        selectedVectorStore: this.selectedVectorStore,
        documentCounts,
        totalDocuments: allDocs.length
      });
    });
  }

  loadVectorStores(forceRefresh = false): void {
    this.loadingStores = true;
    this.vectorStoreService.list(forceRefresh).subscribe({
      next: (stores: VectorStore[]) => {
        this.vectorStores = stores;

        // If we have a libraryId in the URL, use it. Otherwise, default to first store.
        const libraryId = this.route.snapshot.queryParamMap.get('libraryId');
        const storeFromUrl = stores.find(s => s.id === libraryId);

        if (storeFromUrl) {
          this.selectedVectorStore = storeFromUrl;
        } else if (stores.length > 0 && !this.selectedVectorStore) {
          this.selectedVectorStore = stores[0];
          // Update URL to match initial selection
          this.updateUrl(stores[0].id);
        }

        this.loadDocuments(false, forceRefresh);
        this.loadingStores = false;
      },
      error: (err) => {
        console.error('Error loading library:', err);
        this.loadingStores = false;
      }
    });
  }

  loadDocuments(skipLoading = false, forceRefresh = false): void {
    if (!skipLoading) {
      this.loadingDocuments = true;
    }
    const vectorStoreId = this.selectedVectorStore?.id || undefined;
    forkJoin({
      documents: this.documentService.list(vectorStoreId, forceRefresh),
      documentAccess: this.documentAccessService.list(vectorStoreId).pipe(
        catchError(() => of([] as DocumentAccess[]))
      )
    }).subscribe({
      next: ({ documents: docs, documentAccess }) => {
        this.documents = docs;
        this.documentAccessList = documentAccess;
        this.loadingDocuments = false;

        // If user is viewing Accessed, ensure we have all documents to display them.
        if (this.activeTypeFilter === 'accessed') {
          this.ensureAllDocumentsLoaded(forceRefresh);
        }

        if (this.statusFilter && !this.availableStatuses.includes(this.statusFilter)) {
          this.statusFilter = '';
        }
        this.selectedDocumentIds.clear();
        if (this.isInWorkspace) {
          this.syncContextState();
        }
      },
      error: (err) => {
        console.error('Error loading documents:', err);
        this.loadingDocuments = false;
      }
    });
  }

  onVectorStoreSelected(store: VectorStore): void {
    this.statusFilter = '';
    this.selectionMode = false;
    this.updateUrl(store.id);
  }

  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedDocumentIds.clear();
    }
  }

  private updateUrl(libraryId: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { libraryId },
      queryParamsHandling: 'merge'
    });
  }

  onDocumentUploaded(): void {
    // Reload documents without showing loading animation (skipLoading = true)
    // The upload component already showed loading during the upload process
    this.loadDocuments(true);
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
        if (this.isInWorkspace) {
          this.knowledgeContext.updateState({
            vectorStores: this.vectorStores,
            selectedVectorStore: this.selectedVectorStore
          });
        }
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
        if (this.isInWorkspace) {
          this.syncContextState();
        }
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
      next: () => {
        this.selectedDocumentIds.delete(documentId);
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error deleting document:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete document.');
      }
    });
  }

  toggleDocumentSelection(documentId: string): void {
    if (this.selectedDocumentIds.has(documentId)) {
      this.selectedDocumentIds.delete(documentId);
    } else {
      this.selectedDocumentIds.add(documentId);
    }
  }

  isDocumentSelected(documentId: string): boolean {
    return this.selectedDocumentIds.has(documentId);
  }

  get isAllSelected(): boolean {
    const docs = this.filteredDocuments;
    if (docs.length === 0) return false;
    return docs.every(doc => this.selectedDocumentIds.has(doc.id));
  }

  toggleAllSelection(): void {
    if (this.isAllSelected) {
      this.filteredDocuments.forEach(doc => this.selectedDocumentIds.delete(doc.id));
    } else {
      this.filteredDocuments.forEach(doc => this.selectedDocumentIds.add(doc.id));
    }
  }

  async deleteSelectedDocuments(): Promise<void> {
    const count = this.selectedDocumentIds.size;
    if (count === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete documents?',
      message: `This will delete ${count} selected documents.`,
      itemName: '',
      secondaryMessage: 'This cannot be undone.'
    });

    if (!confirmed) return;

    this.loadingDocuments = true;
    const idsToDelete = Array.from(this.selectedDocumentIds);
    this.documentService.bulkDelete(idsToDelete).subscribe({
      next: () => {
        this.selectedDocumentIds.clear();
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error bulk deleting documents:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete selected documents.');
        this.loadingDocuments = false;
      }
    });
  }

  clearSelection(): void {
    this.selectedDocumentIds.clear();
  }

  toggleDocumentActions(docId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openActionsDocId = this.openActionsDocId === docId ? null : docId;
  }

  closeDocumentActions(): void {
    this.openActionsDocId = null;
  }

  isActionsOpen(docId: string): boolean {
    return this.openActionsDocId === docId;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeDocumentActions();
  }

  setTypeFilter(filter: 'all' | 'uploaded' | 'accessed'): void {
    const next = this.activeTypeFilter === filter ? 'all' : filter;
    this.activeTypeFilter = next;
    if (next === 'accessed') {
      // When viewing Accessed, ignore status filters.
      this.activeStatusFilter = 'all';
      this.ensureAllDocumentsLoaded();
    }
  }

  setStatusFilter(filter: 'finished' | 'processing' | 'failed'): void {
    // Status filters are disabled while viewing Accessed.
    if (this.activeTypeFilter === 'accessed') {
      return;
    }
    this.activeStatusFilter = this.activeStatusFilter === filter ? 'all' : filter;
  }

  private ensureAllDocumentsLoaded(forceRefresh = false): void {
    if (this.allDocumentsLoaded && !forceRefresh) {
      return;
    }
    // Reuse the main loading indicator to avoid adding extra UI.
    this.loadingDocuments = true;
    this.documentService.list(undefined, forceRefresh).pipe(
      catchError(() => of([] as Document[])),
      finalize(() => {
        this.loadingDocuments = false;
      })
    ).subscribe(docs => {
      this.allDocuments = docs;
      this.allDocumentsLoaded = true;
    });
  }

  /** Base documents: current library + search only. Used for overview card counts so values don't change when type/status filter changes. */
  get baseDocuments(): Document[] {
    let docs = this.documents;
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      docs = docs.filter(doc =>
        doc.title?.toLowerCase().includes(query) ||
        doc.status?.toLowerCase().includes(query)
      );
    }
    return docs;
  }

  /** Filtered list for display: base + type + status filters. Only the list below changes when user selects type/status. */
  get filteredDocuments(): Document[] {
    let docs = this.activeTypeFilter === 'accessed' ? (this.allDocumentsLoaded ? this.allDocuments : this.documents) : this.baseDocuments;

    if (this.activeTypeFilter === 'accessed' && this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      docs = docs.filter(doc =>
        doc.title?.toLowerCase().includes(query) ||
        doc.status?.toLowerCase().includes(query)
      );
    }

    // Status filter from STATUS overview cards
    if (this.activeStatusFilter === 'finished') {
      docs = docs.filter(doc => doc.status === 'completed');
    } else if (this.activeStatusFilter === 'failed') {
      docs = docs.filter(doc => doc.status === 'failed');
    } else if (this.activeStatusFilter === 'processing') {
      docs = docs.filter(doc =>
        doc.status === 'processing' || doc.status === 'in_progress' || doc.status === 'queued'
      );
    }

    // Type filter from DOCUMENT TYPE overview cards
    if (this.activeTypeFilter === 'accessed') {
      const accessedDocIds = new Set(
        this.documentAccessList
          .filter(da => da.vector_store === this.selectedVectorStore?.id)
          .map(da => String(da.document))
      );
      docs = docs.filter(doc => accessedDocIds.has(doc.id));
    }

    return docs;
  }

  get availableStatuses(): string[] {
    const statuses = new Set<string>();
    const docs = this.selectedVectorStore
      ? this.documents.filter(doc => doc.vector_store === this.selectedVectorStore?.id)
      : this.documents;

    docs.forEach(doc => {
      if (doc.status) statuses.add(doc.status);
    });
    return Array.from(statuses).sort();
  }

  get typeUploadedCount(): number {
    return this.baseDocuments.length;
  }

  get typeAccessedCount(): number {
    if (!this.selectedVectorStore?.id) return 0;
    return this.documentAccessList.filter(
      da => da.vector_store === this.selectedVectorStore?.id
    ).length;
  }

  get statusFinishedCount(): number {
    return this.baseDocuments.filter(d => d.status === 'completed').length;
  }

  get statusFailedCount(): number {
    return this.baseDocuments.filter(d => d.status === 'failed').length;
  }

  get statusProcessingCount(): number {
    return this.baseDocuments.filter(d =>
      d.status === 'processing' || d.status === 'in_progress' || d.status === 'queued'
    ).length;
  }

  getDisplayStatus(status: Document['status']): string {
    switch (status) {
      case 'completed': return 'Finished';
      case 'failed': return 'Failed';
      case 'processing':
      case 'in_progress':
      case 'queued': return 'Processing';
      default: return status;
    }
  }

  getDocumentTypeLabel(doc: Document): string {
    if (!this.selectedVectorStore?.id) return 'Uploaded';
    const isAccessed = this.documentAccessList.some(
      da => da.vector_store === this.selectedVectorStore?.id && String(da.document) === doc.id
    );
    return isAccessed ? 'Accessed' : 'Uploaded';
  }

  getFileIcon(title: string): string {
    if (!title) return 'fa-file-lines';
    const ext = title.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext || '')) return 'fa-file-word';
    if (['xls', 'xlsx'].includes(ext || '')) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(ext || '')) return 'fa-file-powerpoint';
    if (ext === 'txt') return 'fa-file-lines';
    return 'fa-file-lines';
  }

  /** File size not available from API; show placeholder */
  getFileSizeDisplay(_doc: Document): string {
    return '—';
  }

  onDocumentCardClick(event: MouseEvent, doc: Document): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('label') || target.closest('input')) {
      return;
    }
    this.toggleDocumentSelection(doc.id);
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
    this.documentService.update(document.id, {
      title,
      vector_store: document.vector_store
    }).subscribe({
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
      // Don't poll if any chat is open
      if (this.chatDocument || this.chatLibrary) {
        return;
      }

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
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
