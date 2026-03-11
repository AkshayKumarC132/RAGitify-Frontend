import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval, of, Subject, forkJoin } from 'rxjs';
import { catchError, filter, finalize, takeUntil, timeout } from 'rxjs/operators';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentAccessService } from '../../../shared/services/document-access.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document, DocumentStatus } from '../../../shared/models/document.model';
import { DocumentAccess } from '../../../shared/models/document-access.model';
import { SharedByMeItem, SharedWithMeItem } from '../../../shared/models/document-share.model';
import Swal from 'sweetalert2/dist/sweetalert2.js';

@Component({
  selector: 'app-knowledge-section',
  templateUrl: './knowledge-section.component.html',
  styleUrls: ['./knowledge-section.component.scss']
})
export class KnowledgeSectionComponent implements OnInit, OnDestroy {
  vectorStores: VectorStore[] = [];
  documents: Document[] = [];
  documentAccessList: DocumentAccess[] = [];
  sharedWithMe: SharedWithMeItem[] = [];
  sharedByMe: SharedByMeItem[] = [];
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
  activeStatusFilter: 'all' | 'finished' | 'processing' | 'failed' = 'all';
  sourceFilter: 'all' | 'LOCAL' | 'S3' = 'all';
  dateFilter: 'all' | '7d' | '30d' | '90d' | 'older' = 'all';
  sizeFilter: 'all' | 'unknown' | 'small' | 'medium' | 'large' = 'all';
  fileTypeFilter = 'all';
  activeWorkspaceTab: 'documents' | 'shared-with-me' | 'shared-by-me' = 'documents';
  openActionsDocId: string | null = null;
  loadingSharedWithMe = false;
  loadingSharedByMe = false;
  shareDialogOpen = false;
  moveDialogOpen = false;
  shareSubmitting = false;
  moveSubmitting = false;
  shareTargetEmail = '';
  shareExpiresAt = '';
  shareDocumentIds: string[] = [];
  moveDocumentIds: string[] = [];
  moveTargetVectorStoreId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private documentAccessService: DocumentAccessService,
    private documentShareService: DocumentShareService,
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
      const openNewLibrary = params.get('openNewLibrary');

      if (openNewLibrary === '1') {
        this.showCreateVectorStoreForm = true;
        this.showUploadForm = false;
      }

      if (libraryId) {
        this.applyRouteLibrarySelection(libraryId);
      }
    });

    // Keep document search in sync with sidebar search
    this.knowledgeContext.sidebarSearch$
      .pipe(takeUntil(this.destroy$))
      .subscribe(query => {
        this.searchQuery = query;
      });
  }

  ngOnDestroy(): void {
    this.statusPollSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncContextState(skipDocumentCountRefresh = false): void {
    if (!this.isInWorkspace) return;
    if (skipDocumentCountRefresh) {
      this.knowledgeContext.updateState({
        vectorStores: this.vectorStores,
        selectedVectorStore: this.selectedVectorStore
      });
      return;
    }
    this.documentService.list(undefined, false).subscribe({
      next: allDocs => {
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
      },
      error: () => {
        this.knowledgeContext.updateState({
          vectorStores: this.vectorStores,
          selectedVectorStore: this.selectedVectorStore
        });
      }
    });
  }

  loadVectorStores(forceRefresh = false): void {
    this.loadingStores = true;
    this.vectorStoreService.list(forceRefresh).subscribe({
      next: (stores: VectorStore[]) => {
        this.vectorStores = stores;

        const libraryId = this.route.snapshot.queryParamMap.get('libraryId');
        const selectedFromUrl = libraryId ? stores.find(s => s.id === libraryId) || null : null;
        const selectedFromCurrent = this.selectedVectorStore
          ? stores.find(s => s.id === this.selectedVectorStore?.id) || null
          : null;
        const nextSelectedStore = selectedFromUrl || selectedFromCurrent || stores[0] || null;

        const selectionChanged = nextSelectedStore?.id !== this.selectedVectorStore?.id;
        this.selectedVectorStore = nextSelectedStore;
        this.syncWorkspaceTabForSelectedStore();
        this.syncSelectionState();

        if (!libraryId && nextSelectedStore) {
          this.updateUrl(nextSelectedStore.id);
        }

        if (this.selectedVectorStore) {
          this.loadDocuments(false, forceRefresh || selectionChanged);
        } else {
          this.documents = [];
          this.documentAccessList = [];
        }
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
    if (this.selectedVectorStore?.vs_type === 'SHARED') {
      this.documents = [];
      this.documentAccessList = [];
      this.loadingDocuments = false;
      this.loadSharedWithMe(forceRefresh);
      this.loadSharedByMe(forceRefresh);
      if (this.isInWorkspace) {
        this.syncContextState(true);
      }
      return;
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
        if (this.isInWorkspace) {
          this.knowledgeContext.updateState({
            vectorStores: this.vectorStores,
            selectedVectorStore: this.selectedVectorStore
          });
        }
      }
    });
  }

  onVectorStoreSelected(store: VectorStore): void {
    this.resetDocumentFilters();
    this.selectionMode = false;
    this.selectedVectorStore = store;
    this.syncWorkspaceTabForSelectedStore();
    this.syncSelectionState();
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
    if (store.is_system) {
      this.errorMessage = `${store.name} is a system library and cannot be deleted.`;
      return;
    }

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
        this.updateUrl(store.id);
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

    const isAccessed = document && this.getDocumentTypeLabel(document) === 'Accessed';

    if (isAccessed && this.selectedVectorStore?.id) {
      this.documentAccessService.remove({
        document_ids: [documentId],
        vector_store_id: this.selectedVectorStore.id
      }).subscribe({
        next: () => {
          this.selectedDocumentIds.delete(documentId);
          this.loadDocuments();
        },
        error: (err) => {
          console.error('Error removing document access:', err);
          this.errorMessage = this.extractErrorMessage(err, 'Unable to remove document access.');
        }
      });
    } else {
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
  }

  toggleDocumentSelection(documentId: string): void {
    if (this.selectedDocumentIds.has(documentId)) {
      this.selectedDocumentIds.delete(documentId);
    } else {
      this.selectedDocumentIds.add(documentId);
    }
  }

  setWorkspaceTab(tab: 'documents' | 'shared-with-me' | 'shared-by-me'): void {
    if (this.activeWorkspaceTab === tab) {
      return;
    }
    this.activeWorkspaceTab = tab;
    this.closeDocumentActions();
    this.clearSelection();

    if (tab === 'shared-with-me') {
      this.loadSharedWithMe(this.sharedWithMe.length === 0);
    } else if (tab === 'shared-by-me') {
      this.loadSharedByMe(this.sharedByMe.length === 0);
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
    const ids = Array.from(this.selectedDocumentIds);
    const accessedIds: string[] = [];
    const uploadedIds: string[] = [];

    ids.forEach(id => {
      const doc = this.documents.find(d => d.id === id);
      if (doc && this.getDocumentTypeLabel(doc) === 'Accessed') {
        accessedIds.push(id);
      } else {
        uploadedIds.push(id);
      }
    });

    const ops = [];
    if (uploadedIds.length) {
      ops.push(this.documentService.bulkDelete(uploadedIds));
    }
    if (accessedIds.length && this.selectedVectorStore?.id) {
      ops.push(this.documentAccessService.remove({
        document_ids: accessedIds,
        vector_store_id: this.selectedVectorStore.id
      }));
    }

    if (!ops.length) {
      this.loadingDocuments = false;
      return;
    }

    forkJoin(ops).subscribe({
      next: () => {
        this.selectedDocumentIds.clear();
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error deleting selected documents:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete selected documents.');
        this.loadingDocuments = false;
      }
    });
  }

  clearSelection(): void {
    this.selectedDocumentIds.clear();
  }

  get canShareSelectedDocuments(): boolean {
    return this.getSelectedShareableDocuments().length > 0;
  }

  get canMoveSelectedDocuments(): boolean {
    return this.getSelectedMovableDocuments().length > 0 && this.moveTargetOptions.length > 0;
  }

  get moveTargetOptions(): VectorStore[] {
    return this.getMoveTargetOptions(this.moveDocumentIds.length ? this.moveDocumentIds : Array.from(this.selectedDocumentIds));
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

  setStatusFilter(filter: 'finished' | 'processing' | 'failed'): void {
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
    return this.applySearchAndAttributeFilters(this.documents);
  }

  get filteredDocuments(): Document[] {
    let docs = this.documents;
    docs = this.applySearchAndAttributeFilters(docs);

    if (this.activeStatusFilter === 'finished') {
      docs = docs.filter(doc => this.resolvedDocumentStatus(doc) === 'completed');
    } else if (this.activeStatusFilter === 'failed') {
      docs = docs.filter(doc => this.resolvedDocumentStatus(doc) === 'failed');
    } else if (this.activeStatusFilter === 'processing') {
      docs = docs.filter(doc =>
        ['processing', 'in_progress', 'queued'].includes(this.resolvedDocumentStatus(doc))
      );
    }

    return docs;
  }

  get filteredSharedWithMe(): SharedWithMeItem[] {
    return this.filterShareItems(this.sharedWithMe, 'recipient');
  }

  get filteredSharedByMe(): SharedByMeItem[] {
    return this.filterShareItems(this.sharedByMe, 'owner');
  }

  get isSharedVectorStoreSelected(): boolean {
    return this.selectedVectorStore?.vs_type === 'SHARED';
  }

  get availableFileTypes(): string[] {
    const fileTypes = new Set<string>();
    this.documents.forEach(doc => fileTypes.add(this.getDocumentFileType(doc)));
    return Array.from(fileTypes).sort((a, b) => a.localeCompare(b));
  }

  get hasActiveAdvancedFilters(): boolean {
    return this.sourceFilter !== 'all'
      || this.dateFilter !== 'all'
      || this.sizeFilter !== 'all'
      || this.fileTypeFilter !== 'all'
      || this.activeStatusFilter !== 'all';
  }

  get availableStatuses(): string[] {
    const statuses = new Set<string>();
    const docs = this.selectedVectorStore
      ? this.documents.filter(doc => doc.vector_store === this.selectedVectorStore?.id)
      : this.documents;

    docs.forEach(doc => {
      statuses.add(this.resolvedDocumentStatus(doc));
    });
    return Array.from(statuses).sort();
  }

  get statusFinishedCount(): number {
    return this.baseDocuments.filter(d => this.resolvedDocumentStatus(d) === 'completed').length;
  }

  get statusFailedCount(): number {
    return this.baseDocuments.filter(d => this.resolvedDocumentStatus(d) === 'failed').length;
  }

  get statusProcessingCount(): number {
    return this.baseDocuments.filter(d =>
      ['processing', 'in_progress', 'queued'].includes(this.resolvedDocumentStatus(d))
    ).length;
  }

  resetDocumentFilters(): void {
    this.statusFilter = '';
    this.activeStatusFilter = 'all';
    this.sourceFilter = 'all';
    this.dateFilter = 'all';
    this.sizeFilter = 'all';
    this.fileTypeFilter = 'all';
  }

  get documentCounts(): Record<string, number> {
    return this.knowledgeContext.currentState.documentCounts || {};
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

  getWorkspaceSubtitle(): string {
    if (this.isSharedVectorStoreSelected && this.activeWorkspaceTab === 'shared-with-me') {
      return `${this.filteredSharedWithMe.length} active documents shared with you`;
    }
    if (this.isSharedVectorStoreSelected && this.activeWorkspaceTab === 'shared-by-me') {
      return `${this.filteredSharedByMe.length} active documents you shared with others`;
    }
    if (this.activeWorkspaceTab === 'shared-with-me') {
      return `${this.filteredSharedWithMe.length} active shares visible to you`;
    }
    if (this.activeWorkspaceTab === 'shared-by-me') {
      return `${this.filteredSharedByMe.length} active shares created by you`;
    }
    if (!this.selectedVectorStore) {
      return `${this.filteredDocuments.length} documents`;
    }

    const storeType = this.selectedVectorStore.vs_type || 'CUSTOM';
    const systemNote = this.selectedVectorStore.is_system ? ' · read-only system rules apply' : '';
    return `${this.filteredDocuments.length} documents · ${storeType}${systemNote}`;
  }

  resolvedDocumentStatus(doc: Document): Document['status'] {
    return doc.ingestion_status || doc.status || 'queued';
  }

  resolvedDocumentDate(doc: Document): string {
    return doc.updated_at || doc.created_at || doc.uploaded_at;
  }

  getDocumentSecondaryText(doc: Document): string {
    return [
      doc.original_filename,
      doc.file_type,
      doc.access_type,
      doc.source,
      doc.checksum
    ].filter(Boolean).join(' ');
  }

  getDocumentFileType(doc: Document): string {
    return (doc.file_type || doc.original_filename?.split('.').pop() || 'file').toUpperCase();
  }

  getDisplayDocumentName(doc: Document): string {
    return doc.original_filename || doc.title || doc.id;
  }

  getTruncatedDocumentName(doc: Document, maxBaseLength = 14): string {
    const name = this.getDisplayDocumentName(doc);
    const lastDot = name.lastIndexOf('.');
    const hasExtension = lastDot > 0;
    const baseName = hasExtension ? name.slice(0, lastDot) : name;

    if (baseName.length <= maxBaseLength) {
      return name;
    }

    return `${baseName.slice(0, maxBaseLength)}...`;
  }

  getDocumentSource(doc: Document): string {
    return doc.source || 'LOCAL';
  }

  canPreviewDocument(doc: Document): boolean {
    return !!doc.signed_url;
  }

  canUploadToSelectedStore(): boolean {
    if (!this.selectedVectorStore) {
      return false;
    }
    return this.selectedVectorStore.vs_type !== 'SHARED';
  }

  canShareDocument(doc: Document): boolean {
    return this.getDocumentTypeLabel(doc) !== 'Accessed'
      && this.resolvedDocumentStatus(doc) === 'completed'
      && doc.access_type !== 'shared';
  }

  canMoveDocument(doc: Document): boolean {
    return this.canShareDocument(doc) && this.getMoveTargetOptions([doc.id]).length > 0;
  }

  formatFileSize(doc: Document): string {
    if (!doc.file_size && doc.file_size !== 0) {
      return '-';
    }
    const size = doc.file_size;
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  isSystemStore(store: VectorStore | null): boolean {
    return !!store?.is_system;
  }

  getFileIcon(title: string): string {
    const ext = this.getFileExtension(title);
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
    if (['txt', 'log', 'md', 'epub', 'tex', 'msg'].includes(ext)) return 'fa-file-lines';
    if (['json', 'xml', 'html', 'htm', 'yaml', 'yml', 'ini', 'cfg'].includes(ext)) return 'fa-file-code';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'avif', 'ico', 'heic', 'heif', 'apng', 'jfif'].includes(ext)) return 'fa-file-image';
    if (['mp4', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts'].includes(ext)) return 'fa-file-video';
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus', 'wma', 'alac'].includes(ext)) return 'fa-file-audio';
    if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'rar', '7z', 'xz', 'txz'].includes(ext)) return 'fa-file-zipper';
    return 'fa-file-lines';
  }

  getFileIconTone(title: string): string {
    const ext = this.getFileExtension(title);
    if (ext === 'pdf') return 'tone-pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'tone-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'tone-sheet';
    if (['ppt', 'pptx'].includes(ext)) return 'tone-slide';
    if (['json', 'xml', 'html', 'htm', 'yaml', 'yml', 'ini', 'cfg'].includes(ext)) return 'tone-code';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'avif', 'ico', 'heic', 'heif', 'apng', 'jfif'].includes(ext)) return 'tone-image';
    if (['mp4', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts'].includes(ext)) return 'tone-video';
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus', 'wma', 'alac'].includes(ext)) return 'tone-audio';
    if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'rar', '7z', 'xz', 'txz'].includes(ext)) return 'tone-archive';
    return 'tone-text';
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
        ['queued', 'in_progress', 'processing'].includes(this.resolvedDocumentStatus(doc))
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
    if (this.resolvedDocumentStatus(doc) === status.status) {
      return;
    }
    const next = [...this.documents];
    next[docIndex] = { ...doc, status: status.status, ingestion_status: status.status };
    this.documents = next;
  }

  formatDate(date?: string): string {
    if (!date) {
      return '-';
    }
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

  openShareDialog(documentIds?: string[]): void {
    const ids = documentIds?.length ? documentIds : Array.from(this.selectedDocumentIds);
    const shareable = this.getEligibleDocuments(ids, 'share');
    if (!shareable.length) {
      void Swal.fire({
        title: 'Nothing to share',
        text: 'Only your completed documents can be shared with another user.',
        icon: 'info',
        confirmButtonText: 'Close'
      });
      return;
    }

    if (shareable.length !== ids.length) {
      void Swal.fire({
        title: 'Some documents were excluded',
        text: 'Only owned, completed documents can be shared. Deselect shared or processing files and try again.',
        icon: 'warning',
        confirmButtonText: 'Close'
      });
      return;
    }

    this.shareDocumentIds = shareable.map(doc => doc.id);
    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
    this.shareDialogOpen = true;
    this.closeDocumentActions();
  }

  closeShareDialog(): void {
    this.shareDialogOpen = false;
    this.shareSubmitting = false;
    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
    this.shareDocumentIds = [];
  }

  submitShare(): void {
    const email = this.shareTargetEmail.trim();
    if (!email || !this.shareDocumentIds.length || this.shareSubmitting) {
      return;
    }

    this.shareSubmitting = true;
    this.documentShareService.share({
      document_ids: this.shareDocumentIds,
      target_user_email: email,
      expires_at: this.shareExpiresAt ? new Date(this.shareExpiresAt).toISOString() : null
    }).subscribe({
      next: (response) => {
        this.shareSubmitting = false;
        this.closeShareDialog();
        this.loadSharedByMe(true);
        void Swal.fire({
          title: 'Share updated',
          text: `${response.shared_count} document${response.shared_count === 1 ? '' : 's'} shared successfully.`,
          icon: 'success',
          confirmButtonText: 'Close'
        });
      },
      error: (err) => {
        this.shareSubmitting = false;
        void Swal.fire({
          title: 'Unable to share documents',
          text: this.extractErrorMessage(err, 'The share request could not be completed.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  openMoveDialog(documentIds?: string[]): void {
    const ids = documentIds?.length ? documentIds : Array.from(this.selectedDocumentIds);
    const movable = this.getEligibleDocuments(ids, 'move');
    if (!movable.length) {
      void Swal.fire({
        title: 'Nothing to move',
        text: 'Only your completed documents can be moved to another DEFAULT or CUSTOM library.',
        icon: 'info',
        confirmButtonText: 'Close'
      });
      return;
    }

    if (movable.length !== ids.length) {
      void Swal.fire({
        title: 'Some documents were excluded',
        text: 'Only owned, completed documents can be moved. Shared or processing files are not eligible.',
        icon: 'warning',
        confirmButtonText: 'Close'
      });
      return;
    }

    const targets = this.getMoveTargetOptions(movable.map(doc => doc.id));
    if (!targets.length) {
      void Swal.fire({
        title: 'No valid destination',
        text: 'Create or choose another DEFAULT or CUSTOM library before moving these documents.',
        icon: 'info',
        confirmButtonText: 'Close'
      });
      return;
    }

    this.moveDocumentIds = movable.map(doc => doc.id);
    this.moveTargetVectorStoreId = targets[0]?.id || '';
    this.moveDialogOpen = true;
    this.closeDocumentActions();
  }

  closeMoveDialog(): void {
    this.moveDialogOpen = false;
    this.moveSubmitting = false;
    this.moveDocumentIds = [];
    this.moveTargetVectorStoreId = '';
  }

  submitMove(): void {
    if (!this.moveDocumentIds.length || !this.moveTargetVectorStoreId || this.moveSubmitting) {
      return;
    }

    this.moveSubmitting = true;
    this.documentService.move({
      document_ids: this.moveDocumentIds,
      target_vector_store_id: this.moveTargetVectorStoreId
    }).subscribe({
      next: () => {
        const movedCount = this.moveDocumentIds.length;
        this.moveSubmitting = false;
        this.closeMoveDialog();
        this.clearSelection();
        this.loadDocuments(false, true);
        this.loadVectorStores(true);
        this.loadSharedByMe(true);
        void Swal.fire({
          title: 'Documents moved',
          text: `${movedCount} document${movedCount === 1 ? '' : 's'} moved successfully.`,
          icon: 'success',
          confirmButtonText: 'Close'
        });
      },
      error: (err) => {
        this.moveSubmitting = false;
        void Swal.fire({
          title: 'Unable to move documents',
          text: this.extractErrorMessage(err, 'The selected documents could not be moved.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  async revokeShareByOwner(item: SharedByMeItem): Promise<void> {
    const result = await Swal.fire({
      title: 'Revoke this share?',
      text: `${item.document_title} will no longer be available to ${item.recipient_email}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Revoke share',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) {
      return;
    }

    this.documentShareService.revokeByOwner({
      document_ids: [item.document_id],
      target_user_id: item.recipient_id
    }).subscribe({
      next: () => {
        this.sharedByMe = this.sharedByMe.filter(share => !(share.document_id === item.document_id && share.recipient_id === item.recipient_id));
      },
      error: (err) => {
        void Swal.fire({
          title: 'Unable to revoke share',
          text: this.extractErrorMessage(err, 'The share could not be revoked.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  async revokeSharedWithMe(item: SharedWithMeItem): Promise<void> {
    const result = await Swal.fire({
      title: 'Remove shared document?',
      text: `${item.document_title} will be removed from your shared surface.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove access',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) {
      return;
    }

    this.documentShareService.revokeSharedWithMe([item.document_id]).subscribe({
      next: () => {
        this.sharedWithMe = this.sharedWithMe.filter(share => share.document_id !== item.document_id);
      },
      error: (err) => {
        void Swal.fire({
          title: 'Unable to remove access',
          text: this.extractErrorMessage(err, 'The shared document could not be removed from your view.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  jumpToSharedLibrary(): void {
    const sharedStore = this.vectorStores.find(store => store.vs_type === 'SHARED');
    if (!sharedStore) {
      return;
    }
    this.activeWorkspaceTab = 'documents';
    this.onVectorStoreSelected(sharedStore);
  }

  getShareDialogDocuments(): Document[] {
    return this.shareDocumentIds
      .map(id => this.documents.find(doc => doc.id === id))
      .filter((doc): doc is Document => !!doc);
  }

  getMoveDialogDocuments(): Document[] {
    return this.moveDocumentIds
      .map(id => this.documents.find(doc => doc.id === id))
      .filter((doc): doc is Document => !!doc);
  }

  getShareExpiryLabel(item: SharedWithMeItem | SharedByMeItem): string {
    if (!item.expires_at) {
      return 'Never expires';
    }
    return `Expires ${this.formatDate(item.expires_at)}`;
  }

  getShareStatusLabel(item: SharedWithMeItem | SharedByMeItem): string {
    if (item.revoked_at) {
      return 'Revoked';
    }
    if (!item.is_active && !item.active) {
      return 'Inactive';
    }
    if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
      return 'Expired';
    }
    return 'Active';
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

  private getFileExtension(title: string): string {
    if (!title) {
      return '';
    }
    return title.split('.').pop()?.toLowerCase() || '';
  }

  private applySearchAndAttributeFilters(documents: Document[]): Document[] {
    let docs = [...documents];

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      docs = docs.filter(doc =>
        doc.title?.toLowerCase().includes(query) ||
        this.resolvedDocumentStatus(doc).toLowerCase().includes(query) ||
        this.getDocumentSecondaryText(doc).toLowerCase().includes(query)
      );
    }

    if (this.fileTypeFilter !== 'all') {
      docs = docs.filter(doc => this.getDocumentFileType(doc) === this.fileTypeFilter);
    }

    if (this.sourceFilter !== 'all') {
      docs = docs.filter(doc => this.getDocumentSource(doc) === this.sourceFilter);
    }

    if (this.dateFilter !== 'all') {
      const now = Date.now();
      docs = docs.filter(doc => {
        const resolved = this.resolvedDocumentDate(doc);
        const dateValue = resolved ? new Date(resolved).getTime() : NaN;
        if (Number.isNaN(dateValue)) {
          return false;
        }
        const ageDays = (now - dateValue) / 86400000;
        if (this.dateFilter === '7d') return ageDays <= 7;
        if (this.dateFilter === '30d') return ageDays <= 30;
        if (this.dateFilter === '90d') return ageDays <= 90;
        return ageDays > 90;
      });
    }

    if (this.sizeFilter !== 'all') {
      docs = docs.filter(doc => {
        const size = doc.file_size;
        if (this.sizeFilter === 'unknown') {
          return size === undefined || size === null;
        }
        if (size === undefined || size === null) {
          return false;
        }
        if (this.sizeFilter === 'small') return size < 1024 * 1024;
        if (this.sizeFilter === 'medium') return size >= 1024 * 1024 && size < 10 * 1024 * 1024;
        return size >= 10 * 1024 * 1024;
      });
    }

    return docs;
  }

  private applyRouteLibrarySelection(libraryId: string): void {
    if (!libraryId || !this.vectorStores.length) {
      return;
    }

    const store = this.vectorStores.find(vs => vs.id === libraryId);
    if (!store) {
      return;
    }

    const selectionChanged = store.id !== this.selectedVectorStore?.id;
    this.selectedVectorStore = store;
    this.selectedDocumentIds.clear();
    this.selectionMode = false;
    this.syncWorkspaceTabForSelectedStore();
    this.syncSelectionState();

    if (selectionChanged) {
      this.loadDocuments(false, true);
    }
  }

  private syncSelectionState(): void {
    if (!this.isInWorkspace) {
      return;
    }
    this.knowledgeContext.updateState({
      vectorStores: this.vectorStores,
      selectedVectorStore: this.selectedVectorStore
    });
  }

  private syncWorkspaceTabForSelectedStore(): void {
    if (this.isSharedVectorStoreSelected) {
      if (this.activeWorkspaceTab === 'documents') {
        this.activeWorkspaceTab = 'shared-with-me';
      }
      return;
    }

    if (this.activeWorkspaceTab !== 'documents') {
      this.activeWorkspaceTab = 'documents';
    }
  }

  private loadSharedWithMe(forceRefresh = false): void {
    if (this.loadingSharedWithMe && !forceRefresh) {
      return;
    }
    this.loadingSharedWithMe = true;
    this.documentShareService.listSharedWithMe().pipe(
      finalize(() => {
        this.loadingSharedWithMe = false;
      })
    ).subscribe({
      next: items => {
        this.sharedWithMe = items;
      },
      error: err => {
        console.error('Error loading shared-with-me documents:', err);
      }
    });
  }

  private loadSharedByMe(forceRefresh = false): void {
    if (this.loadingSharedByMe && !forceRefresh) {
      return;
    }
    this.loadingSharedByMe = true;
    this.documentShareService.listSharedByMe().pipe(
      finalize(() => {
        this.loadingSharedByMe = false;
      })
    ).subscribe({
      next: items => {
        this.sharedByMe = items;
      },
      error: err => {
        console.error('Error loading shared-by-me documents:', err);
      }
    });
  }

  private filterShareItems<T extends SharedWithMeItem | SharedByMeItem>(items: T[], mode: 'recipient' | 'owner'): T[] {
    if (!this.searchQuery.trim()) {
      return items;
    }
    const query = this.searchQuery.trim().toLowerCase();
    return items.filter(item => {
      const targetEmail = mode === 'recipient' ? item.owner_email : item.recipient_email;
      return [
        item.document_title,
        item.document_id,
        item.owner_email,
        item.recipient_email,
        targetEmail
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }

  private getSelectedShareableDocuments(): Document[] {
    return this.getEligibleDocuments(Array.from(this.selectedDocumentIds), 'share');
  }

  private getSelectedMovableDocuments(): Document[] {
    return this.getEligibleDocuments(Array.from(this.selectedDocumentIds), 'move');
  }

  private getEligibleDocuments(documentIds: string[], operation: 'share' | 'move'): Document[] {
    return documentIds
      .map(id => this.documents.find(doc => doc.id === id))
      .filter((doc): doc is Document => !!doc)
      .filter(doc => operation === 'share' ? this.canShareDocument(doc) : this.canMoveDocument(doc));
  }

  private getMoveTargetOptions(documentIds: string[]): VectorStore[] {
    const sourceStoreIds = new Set(
      documentIds
        .map(id => this.documents.find(doc => doc.id === id)?.vector_store)
        .filter((id): id is string => !!id)
    );

    return this.vectorStores.filter(store =>
      store.vs_type !== 'SHARED' &&
      !sourceStoreIds.has(store.id)
    );
  }
}
