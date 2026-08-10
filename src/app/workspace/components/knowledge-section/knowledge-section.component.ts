import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, interval, of, Subject, forkJoin, firstValueFrom } from 'rxjs';
import { catchError, filter, finalize, takeUntil, timeout } from 'rxjs/operators';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentAccessService } from '../../../shared/services/document-access.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { ConnectionShareService } from '../../../shared/services/connection-share.service';
import { SharedWithMeItem, SharedByMeItem } from '../../../shared/models/document-share.model';
import { ConnectionSharedWithMeItem, ConnectionSharedByMeItem } from '../../../shared/models/connection-share.model';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { WorkspaceLibraryDeleteFlowService } from '../../services/workspace-library-delete-flow.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document, DocumentStatus } from '../../../shared/models/document.model';
import { DocumentAccess } from '../../../shared/models/document-access.model';
import { User } from '../../../shared/models/user.model';
import Swal from 'sweetalert2/dist/sweetalert2.js';


export interface UnifiedShareItem {
  itemType: 'document' | 'connection';
  id: string | number;
  resourceId: string;
  resourceTitle: string;
  ownerEmail: string;
  recipientEmail: string;
  sharedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  active: boolean;
  revokedAt: string | null;
  raw: SharedWithMeItem | SharedByMeItem | ConnectionSharedWithMeItem | ConnectionSharedByMeItem;
}

@Component({
  selector: 'app-knowledge-section',
  templateUrl: './knowledge-section.component.html',
  styleUrls: ['./knowledge-section.component.scss']
})
export class KnowledgeSectionComponent implements OnInit, OnDestroy {
  @ViewChild('createLibraryNameInput') createLibraryNameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('renameLibraryInput') renameLibraryInput?: ElementRef<HTMLInputElement>;
  vectorStores: VectorStore[] = [];
  documents: Document[] = [];
  documentAccessList: DocumentAccess[] = [];
  sharedWithMe: UnifiedShareItem[] = [];
  sharedByMe: UnifiedShareItem[] = [];
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
  isDragging = false;
  pendingUploadFiles: File[] | null = null;
  private dragCounter = 0;
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
  sharedOwnerFilter = 'all';
  sharedDateFilter: 'all' | '7d' | '30d' | '90d' | 'older' = 'all';
  sharedTypeFilter: 'all' | 'document' | 'connection' = 'all';
  sharedRecipientFilter = 'all';
  sharedByMeDateFilter: 'all' | '7d' | '30d' | '90d' | 'older' = 'all';
  sharedByMeTypeFilter: 'all' | 'document' | 'connection' = 'all';
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
  shareUsers: User[] = [];
  filteredShareUsers: User[] = [];
  loadingShareUsers = false;
  showShareUserDropdown = false;
  private hasLoadedShareUsers = false;
  shareDocumentIds: string[] = [];
  moveDocumentIds: string[] = [];
  moveTargetVectorStoreId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService,
    private documentAccessService: DocumentAccessService,
    private documentShareService: DocumentShareService,
    private connectionShareService: ConnectionShareService,
    private confirmDialogService: ConfirmDialogService,
    private authService: AuthService,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private libraryDeleteFlow: WorkspaceLibraryDeleteFlowService,
    private toast: ToastService,
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
        setTimeout(() => this.createLibraryNameInput?.nativeElement.focus(), 0);
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
      const openEditLibrary = params.get('openEditLibrary');
      const openDeleteLibrary = params.get('openDeleteLibrary');
      const openLibraryChat = params.get('openLibraryChat');
      const workspaceTab = params.get('workspaceTab');

      if (openNewLibrary === '1') {
        this.showCreateVectorStoreForm = true;
        this.showUploadForm = false;
        setTimeout(() => this.createLibraryNameInput?.nativeElement.focus(), 0);
      }

      if (libraryId) {
        this.applyRouteLibrarySelection(libraryId);
      }

      this.applyRouteWorkspaceTab(workspaceTab);

      if (libraryId && openEditLibrary === '1') {
        this.handleRouteLibraryEditRequest(libraryId);
      }

      if (libraryId && openDeleteLibrary === '1') {
        this.handleRouteLibraryDeleteRequest(libraryId);
      }

      if (libraryId && openLibraryChat === '1') {
        this.handleRouteLibraryChatRequest(libraryId);
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

        this.tryOpenPendingLibraryChat();

        const openLibraryChat = this.route.snapshot.queryParamMap.get('openLibraryChat');
        const workspaceTab = this.route.snapshot.queryParamMap.get('workspaceTab');
        this.applyRouteWorkspaceTab(workspaceTab);
        if (this.selectedVectorStore && openLibraryChat === '1') {
          this.handleRouteLibraryChatRequest(this.selectedVectorStore.id);
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

  getDisplaySelectedLibraryName(maxLength = 80): string {
    const name = (this.selectedVectorStore?.name || '').trim();
    if (!name) {
      return 'Documents';
    }
    if (name.length <= maxLength) {
      return name;
    }
    return `${name.slice(0, maxLength)}...`;
  }

  private updateUrl(libraryId: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { libraryId, openNewLibrary: null },
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
    } else {
      this.pendingUploadFiles = null;
    }
  }

  // ─── Drag-and-drop upload ───────────────────────────────────────
  onDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragCounter++;
    this.isDragging = true;
  }

  onDragOver(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDragLeave(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragCounter = Math.max(0, this.dragCounter - 1);
    if (this.dragCounter === 0) {
      this.isDragging = false;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragCounter = 0;
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    if (!this.vectorStores.length) {
      this.toast.warning('No library available', 'Create a library before uploading documents.');
      return;
    }

    this.pendingUploadFiles = Array.from(files);
    this.showCreateVectorStoreForm = false;
    this.showUploadForm = true;
    const noun = files.length === 1 ? 'file' : 'files';
    this.toast.info('Files ready to upload', `${files.length} ${noun} added. Review and confirm to upload.`);
  }

  private hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  startVectorStoreEdit(store: VectorStore): void {
    this.editingVectorStore = store;
    this.editVectorStoreForm.reset({ name: store.name });
    setTimeout(() => this.renameLibraryInput?.nativeElement.focus(), 0);
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
    const documentsForDeleteFlow = await firstValueFrom(
      this.documentService.list(undefined, false).pipe(
        catchError(() => of(this.documents))
      )
    );

    await this.libraryDeleteFlow.openDeleteLibraryFlow(store, this.vectorStores, documentsForDeleteFlow, {
      onDeleted: () => {
        this.vectorStores = this.vectorStores.filter(vs => vs.id !== store.id);
        if (this.selectedVectorStore?.id === store.id) {
          this.selectedVectorStore = this.vectorStores[0] || null;
        }
        this.loadDocuments(false, true);
        if (this.isInWorkspace) {
          this.syncContextState();
        }
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
        this.loadDocuments(false, true); // <--- Add this line to clear the documents list
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

  get isShareTargetValid(): boolean {
    const email = this.shareTargetEmail.trim().toLowerCase();
    if (!email) {
      return false;
    }
    return this.shareUsers.some(user => (user.email || '').toLowerCase() === email);
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

  showFileTypeDropdown = false;
  showStatusDropdown = false;
  showSourceDropdown = false;
  showDateDropdown = false;
  showSizeDropdown = false;
  showSharedOwnerDropdown = false;
  showSharedDateDropdown = false;
  showSharedTypeDropdown = false;
  showSharedRecipientDropdown = false;
  showSharedByMeDateDropdown = false;
  showSharedByMeTypeDropdown = false;

  closeAllDropdowns(): void {
    this.showFileTypeDropdown = false;
    this.showStatusDropdown = false;
    this.showSourceDropdown = false;
    this.showDateDropdown = false;
    this.showSizeDropdown = false;
    this.showSharedOwnerDropdown = false;
    this.showSharedDateDropdown = false;
    this.showSharedTypeDropdown = false;
    this.showSharedRecipientDropdown = false;
    this.showSharedByMeDateDropdown = false;
    this.showSharedByMeTypeDropdown = false;
  }

  toggleFileTypeDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showFileTypeDropdown;
    this.closeAllDropdowns();
    this.showFileTypeDropdown = !current;
  }

  selectFileType(option: string): void {
    this.fileTypeFilter = option;
    this.closeAllDropdowns();
  }

  toggleStatusDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showStatusDropdown;
    this.closeAllDropdowns();
    this.showStatusDropdown = !current;
  }

  selectStatus(option: any): void {
    this.activeStatusFilter = option;
    this.closeAllDropdowns();
  }

  toggleSourceDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSourceDropdown;
    this.closeAllDropdowns();
    this.showSourceDropdown = !current;
  }

  selectSource(option: any): void {
    this.sourceFilter = option;
    this.closeAllDropdowns();
  }

  toggleDateDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showDateDropdown;
    this.closeAllDropdowns();
    this.showDateDropdown = !current;
  }

  selectDate(option: any): void {
    this.dateFilter = option;
    this.closeAllDropdowns();
  }

  toggleSizeDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSizeDropdown;
    this.closeAllDropdowns();
    this.showSizeDropdown = !current;
  }

  selectSize(option: any): void {
    this.sizeFilter = option;
    this.closeAllDropdowns();
  }

  get displayStatusFilter(): string {
    switch (this.activeStatusFilter) {
      case 'finished': return 'Finished';
      case 'processing': return 'Processing';
      case 'failed': return 'Failed';
      default: return 'All statuses';
    }
  }

  get displaySourceFilter(): string {
    switch (this.sourceFilter) {
      case 'LOCAL': return 'Local';
      case 'S3': return 'S3';
      default: return 'All sources';
    }
  }

  private getDisplayDateValue(val: string): string {
    switch (val) {
      case '7d': return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case '90d': return 'Last 90 days';
      case 'older': return 'Older';
      default: return 'Any time';
    }
  }

  get displayDateFilter(): string { return this.getDisplayDateValue(this.dateFilter); }
  get displaySharedDateFilter(): string { return this.getDisplayDateValue(this.sharedDateFilter); }
  get displaySharedByMeDateFilter(): string { return this.getDisplayDateValue(this.sharedByMeDateFilter); }

  get displaySizeFilter(): string {
    switch (this.sizeFilter) {
      case 'unknown': return 'Unknown';
      case 'small': return 'Small under 1 MB';
      case 'medium': return 'Medium 1-10 MB';
      case 'large': return 'Large 10+ MB';
      default: return 'Any size';
    }
  }

  toggleSharedOwnerDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedOwnerDropdown;
    this.closeAllDropdowns();
    this.showSharedOwnerDropdown = !current;
  }

  selectSharedOwner(option: string): void {
    this.sharedOwnerFilter = option;
    this.closeAllDropdowns();
  }

  
  toggleSharedTypeDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedTypeDropdown;
    this.closeAllDropdowns();
    this.showSharedTypeDropdown = !current;
  }

  selectSharedType(option: 'all' | 'document' | 'connection'): void {
    this.sharedTypeFilter = option;
    this.closeAllDropdowns();
  }

  toggleSharedByMeTypeDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedByMeTypeDropdown;
    this.closeAllDropdowns();
    this.showSharedByMeTypeDropdown = !current;
  }

  selectSharedByMeType(option: 'all' | 'document' | 'connection'): void {
    this.sharedByMeTypeFilter = option;
    this.closeAllDropdowns();
  }

  toggleSharedDateDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedDateDropdown;
    this.closeAllDropdowns();
    this.showSharedDateDropdown = !current;
  }

  selectSharedDate(option: any): void {
    this.sharedDateFilter = option;
    this.closeAllDropdowns();
  }

  toggleSharedRecipientDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedRecipientDropdown;
    this.closeAllDropdowns();
    this.showSharedRecipientDropdown = !current;
  }

  selectSharedRecipient(option: string): void {
    this.sharedRecipientFilter = option;
    this.closeAllDropdowns();
  }

  toggleSharedByMeDateDropdown(event: Event): void {
    event.stopPropagation();
    const current = this.showSharedByMeDateDropdown;
    this.closeAllDropdowns();
    this.showSharedByMeDateDropdown = !current;
  }

  selectSharedByMeDate(option: any): void {
    this.sharedByMeDateFilter = option;
    this.closeAllDropdowns();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeDocumentActions();
    this.closeAllDropdowns();
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

  get filteredSharedWithMe(): UnifiedShareItem[] {
    let items = this.filterShareItems(this.sharedWithMe, 'recipient');

    if (this.sharedOwnerFilter !== 'all') {
      items = items.filter(item => item.ownerEmail === this.sharedOwnerFilter);
    }

    if (this.sharedTypeFilter !== 'all') {
      items = items.filter(item => item.itemType === this.sharedTypeFilter);
    }

    if (this.sharedDateFilter !== 'all') {
      const now = Date.now();
      items = items.filter(item => {
        const dateValue = item.sharedAt ? new Date(item.sharedAt).getTime() : NaN;
        if (Number.isNaN(dateValue)) {
          return false;
        }
        const ageDays = (now - dateValue) / 86400000;
        if (this.sharedDateFilter === '7d') return ageDays <= 7;
        if (this.sharedDateFilter === '30d') return ageDays <= 30;
        if (this.sharedDateFilter === '90d') return ageDays <= 90;
        return ageDays > 90;
      });
    }

    return items;
  }

  get filteredSharedByMe(): UnifiedShareItem[] {
    let items = this.filterShareItems(this.sharedByMe, 'owner');

    if (this.sharedRecipientFilter !== 'all') {
      items = items.filter(item => item.recipientEmail === this.sharedRecipientFilter);
    }

    if (this.sharedByMeTypeFilter !== 'all') {
      items = items.filter(item => item.itemType === this.sharedByMeTypeFilter);
    }

    if (this.sharedByMeDateFilter !== 'all') {
      const now = Date.now();
      items = items.filter(item => {
        const dateValue = item.sharedAt ? new Date(item.sharedAt).getTime() : NaN;
        if (Number.isNaN(dateValue)) {
          return false;
        }
        const ageDays = (now - dateValue) / 86400000;
        if (this.sharedByMeDateFilter === '7d') return ageDays <= 7;
        if (this.sharedByMeDateFilter === '30d') return ageDays <= 30;
        if (this.sharedByMeDateFilter === '90d') return ageDays <= 90;
        return ageDays > 90;
      });
    }

    return items;
  }

  get isSharedVectorStoreSelected(): boolean {
    return this.selectedVectorStore?.vs_type === 'SHARED';
  }

  get availableFileTypes(): string[] {
    return [
      "PDF", "DOC", "DOCX", "TXT", "LOG", "MD", "RTF", "ODT", "EPUB", "TEX", "MSG",
      "PPT", "PPTX", "XLS", "XLSX", "CSV", "JSON", "XML", "HTML", "HTM", "YAML", "YML",
      "INI", "CFG", "PNG", "JPG", "JPEG", "GIF", "BMP", "TIFF", "TIF", "WEBP", "AVIF",
      "ICO", "HEIC", "HEIF", "APNG", "JFIF", "MP4", "AVI", "MOV", "WMV", "MKV", "FLV",
      "WEBM", "M4V", "MPG", "MPEG", "3GP", "TS", "MP3", "WAV", "OGG", "FLAC", "AAC", "OPUS",
      "7Z", "XZ", "TXZ"
    ];
  }

  get hasActiveAdvancedFilters(): boolean {
    return this.sourceFilter !== 'all'
      || this.dateFilter !== 'all'
      || this.sizeFilter !== 'all'
      || this.fileTypeFilter !== 'all'
      || this.activeStatusFilter !== 'all';
  }

  get availableSharedOwners(): string[] {
    return Array.from(
      new Set(
        this.sharedWithMe
          .map(item => item.ownerEmail)
          .filter((owner): owner is string => !!owner)
      )
    ).sort((a, b) => a.localeCompare(b));
  }

  get hasActiveSharedFilters(): boolean {
    return this.sharedOwnerFilter !== 'all' || this.sharedDateFilter !== 'all' || this.sharedTypeFilter !== 'all';
  }

  get availableSharedRecipients(): string[] {
    return Array.from(
      new Set(
        this.sharedByMe
          .map(item => item.recipientEmail)
          .filter((recipient): recipient is string => !!recipient)
      )
    ).sort((a, b) => a.localeCompare(b));
  }

  get hasActiveSharedByMeFilters(): boolean {
    return this.sharedRecipientFilter !== 'all' || this.sharedByMeDateFilter !== 'all' || this.sharedByMeTypeFilter !== 'all';
  }

  getTruncatedLibraryOptionName(name: string | undefined | null): string {
    const safeName = (name || '').trim();
    if (safeName.length <= 25) {
      return safeName;
    }
    return `${safeName.slice(0, 25)}...`;
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

  resetSharedFilters(): void {
    this.sharedOwnerFilter = 'all';
    this.sharedDateFilter = 'all';
    this.sharedTypeFilter = 'all';
  }

  resetSharedByMeFilters(): void {
    this.sharedRecipientFilter = 'all';
    this.sharedByMeDateFilter = 'all';
    this.sharedByMeTypeFilter = 'all';
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
    return doc.title || doc.original_filename || doc.id;
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

  openItemDetails(item: UnifiedShareItem): void {
    if (item.itemType === 'document') {
      this.openDocumentDetails(item.resourceId);
    } else {
      this.router.navigate(['/connectors', item.resourceId]);
    }
  }

  openDocumentDetails(documentOrId: Document | string): void {
    const documentId = typeof documentOrId === 'string' ? documentOrId : documentOrId.id;
    const queryParams: Record<string, string> = {};

    if (this.selectedVectorStore?.id) {
      queryParams['libraryId'] = this.selectedVectorStore.id;
    }

    if (this.isSharedVectorStoreSelected && this.activeWorkspaceTab !== 'documents') {
      queryParams['workspaceTab'] = this.activeWorkspaceTab;
    }

    this.router.navigate(['/workspace/document', documentId], { queryParams });
    this.closeDocumentActions();
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

  goToLibraryStats(store: VectorStore): void {
    if (store.vs_type === 'SHARED') {
      return;
    }
    this.router.navigate(['/workspace/library', store.id, 'stats']);
  }

  openShareDialog(documentIds?: string[]): void {
    const ids = documentIds?.length ? documentIds : Array.from(this.selectedDocumentIds);
    const shareable = this.getEligibleDocuments(ids, 'share');
    if (!shareable.length) {
      this.toast.info('Nothing to share', 'Only your completed documents can be shared with another user.');
      return;
    }

    if (shareable.length !== ids.length) {
      this.toast.warning('Some documents were excluded', 'Only owned, completed documents can be shared. Deselect shared or processing files and try again.');
      return;
    }

    this.shareDocumentIds = shareable.map(doc => doc.id);
    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
    this.showShareUserDropdown = false;
    this.loadShareUsers();
    this.shareDialogOpen = true;
    this.closeDocumentActions();
  }

  closeShareDialog(): void {
    this.shareDialogOpen = false;
    this.shareSubmitting = false;
    this.showShareUserDropdown = false;
    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
    this.shareDocumentIds = [];
  }

  onShareTargetFocus(): void {
    this.showShareUserDropdown = true;
    this.filteredShareUsers = this.shareUsers;
    this.loadShareUsers();
  }

  onShareTargetInput(event: Event): void {
    const value = ((event.target as HTMLInputElement).value || '').trim().toLowerCase();
    this.shareTargetEmail = (event.target as HTMLInputElement).value || '';
    this.filteredShareUsers = this.shareUsers.filter(user =>
      (user.email || '').toLowerCase().includes(value)
    );
    this.showShareUserDropdown = true;
  }

  onShareTargetBlur(): void {
    setTimeout(() => {
      this.showShareUserDropdown = false;
    }, 200);
  }

  selectShareUser(user: User): void {
    this.shareTargetEmail = user.email;
    this.showShareUserDropdown = false;
  }

  submitShare(): void {
    const email = this.shareTargetEmail.trim();
    if (!email || !this.shareDocumentIds.length || this.shareSubmitting || !this.isShareTargetValid) {
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
        const noun = `document${response.shared_count === 1 ? '' : 's'}`;
        this.toast.success('Share updated', `${response.shared_count} ${noun} shared successfully.`);
      },
      error: (err) => {
        this.shareSubmitting = false;
        this.toast.error('Unable to share documents', this.extractErrorMessage(err, 'The share request could not be completed.'));
      }
    });
  }

  openMoveDialog(documentIds?: string[]): void {
    const ids = documentIds?.length ? documentIds : Array.from(this.selectedDocumentIds);
    const movable = this.getEligibleDocuments(ids, 'move');
    if (!movable.length) {
      this.toast.info('Nothing to move', 'Only your completed documents can be moved to another library.');
      return;
    }

    if (movable.length !== ids.length) {
      this.toast.warning('Some documents were excluded', 'Only owned, completed documents can be moved. Shared or processing files are not eligible.');
      return;
    }

    const targets = this.getMoveTargetOptions(movable.map(doc => doc.id));
    if (!targets.length) {
      this.toast.info('No valid destination', 'Create or choose another DEFAULT or CUSTOM library before moving these documents.');
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
        const noun = `document${movedCount === 1 ? '' : 's'}`;
        this.toast.success('Documents moved', `${movedCount} ${noun} moved successfully.`);
      },
      error: (err) => {
        this.moveSubmitting = false;
        this.toast.error('Unable to move documents', this.extractErrorMessage(err, 'The selected documents could not be moved.'));
      }
    });
  }

  async revokeShareByOwner(item: UnifiedShareItem): Promise<void> {
    const result = await Swal.fire({
      title: 'Revoke this share?',
      text: `${item.resourceTitle} will no longer be available to ${item.recipientEmail}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Revoke share',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) {
      return;
    }

    const targetUserId = item.raw.recipient_id;
    const nextFn = () => {
      this.sharedByMe = this.sharedByMe.filter(share => !(share.resourceId === item.resourceId && share.raw.recipient_id === targetUserId));
    };
    const errorFn = (err: any) => {
      this.toast.error('Unable to revoke share', this.extractErrorMessage(err, 'The share could not be revoked.'));
    };

    if (item.itemType === 'document') {
      this.documentShareService.revokeByOwner({ document_ids: [item.resourceId], target_user_id: targetUserId }).subscribe({ next: nextFn, error: errorFn });
    } else {
      this.connectionShareService.revoke({ connection_ids: [item.resourceId], target_user_id: targetUserId }).subscribe({ next: nextFn, error: errorFn });
    }
  }

  async revokeSharedWithMe(item: UnifiedShareItem): Promise<void> {
    const result = await Swal.fire({
      title: `Remove shared ${item.itemType}?`,
      text: `${item.resourceTitle} will be removed from your shared surface.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove access',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) {
      return;
    }

    const nextFn = () => {
      this.sharedWithMe = this.sharedWithMe.filter(share => share.resourceId !== item.resourceId);
    };
    const errorFn = (err: any) => {
      this.toast.error('Unable to remove access', this.extractErrorMessage(err, `The shared ${item.itemType} could not be removed from your view.`));
    };

    if (item.itemType === 'document') {
      this.documentShareService.revokeSharedWithMe([item.resourceId]).subscribe({ next: nextFn, error: errorFn });
    } else {
      this.connectionShareService.removeSharedWithMe({ connection_ids: [item.resourceId] }).subscribe({ next: nextFn, error: errorFn });
    }
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

  getShareExpiryLabel(item: UnifiedShareItem): string {
    if (!item.expiresAt) {
      return 'Never expires';
    }
    return `${this.formatDate(item.expiresAt)}`;
  }

  getShareStatusLabel(item: UnifiedShareItem): string {
    if (item.revokedAt) {
      return 'Revoked';
    }
    if (!item.isActive && !item.active) {
      return 'Inactive';
    }
    if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) {
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
      const cleanFilter = this.fileTypeFilter.replace(/^\./, '').toUpperCase();
      docs = docs.filter(doc => this.getDocumentFileType(doc) === cleanFilter);
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

  private handleRouteLibraryChatRequest(libraryId: string): void {
    const store = this.vectorStores.find(vs => vs.id === libraryId);
    if (!store) {
      return;
    }

    if (this.chatLibrary?.id !== store.id) {
      this.openLibraryChat(store);
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openLibraryChat: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private handleRouteLibraryEditRequest(libraryId: string): void {
    const store = this.vectorStores.find(vs => vs.id === libraryId);
    if (!store) {
      return;
    }

    this.startVectorStoreEdit(store);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openEditLibrary: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private handleRouteLibraryDeleteRequest(libraryId: string): void {
    const store = this.vectorStores.find(vs => vs.id === libraryId);
    if (!store) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openDeleteLibrary: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });

    void this.deleteVectorStore(store);
  }

  private tryOpenPendingLibraryChat(): void {
    const pendingStore = this.knowledgeContext.consumePendingLibraryChat();
    if (!pendingStore || !this.selectedVectorStore) {
      return;
    }

    if (pendingStore.id === this.selectedVectorStore.id) {
      this.openLibraryChat(this.selectedVectorStore);
      return;
    }

    this.knowledgeContext.requestPendingLibraryChat(pendingStore);
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

  private applyRouteWorkspaceTab(workspaceTab: string | null): void {
    if (!this.isSharedVectorStoreSelected || !workspaceTab) {
      return;
    }

    if (workspaceTab === 'shared-with-me' || workspaceTab === 'shared-by-me') {
      this.activeWorkspaceTab = workspaceTab;
    }
  }

  private loadSharedWithMe(forceRefresh = false): void {
    if (this.loadingSharedWithMe && !forceRefresh) {
      return;
    }
    this.loadingSharedWithMe = true;
    forkJoin({
      docs: this.documentShareService.listSharedWithMe().pipe(catchError(() => of([]))),
      conns: this.connectionShareService.listSharedWithMe().pipe(catchError(() => of([])))
    }).pipe(
      finalize(() => {
        this.loadingSharedWithMe = false;
      })
    ).subscribe({
      next: ({ docs, conns }) => {
        const docItems = docs.map(d => this.mapDocToUnified(d));
        const connItems = conns.map(c => this.mapConnToUnified(c));
        this.sharedWithMe = [...docItems, ...connItems].sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());
      },
      error: err => {
        console.error('Error loading shared-with-me:', err);
      }
    });
  }

  private loadSharedByMe(forceRefresh = false): void {
    if (this.loadingSharedByMe && !forceRefresh) {
      return;
    }
    this.loadingSharedByMe = true;
    forkJoin({
      docs: this.documentShareService.listSharedByMe().pipe(catchError(() => of([]))),
      conns: this.connectionShareService.listSharedByMe().pipe(catchError(() => of([])))
    }).pipe(
      finalize(() => {
        this.loadingSharedByMe = false;
      })
    ).subscribe({
      next: ({ docs, conns }) => {
        const docItems = docs.map(d => this.mapDocToUnified(d));
        const connItems = conns.map(c => this.mapConnToUnified(c));
        this.sharedByMe = [...docItems, ...connItems].sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime());
      },
      error: err => {
        console.error('Error loading shared-by-me:', err);
      }
    });
  }

  private loadShareUsers(): void {
    if (this.loadingShareUsers || this.hasLoadedShareUsers) {
      return;
    }

    this.loadingShareUsers = true;
    this.authService.listUsers().subscribe({
      next: users => {
        const currentUser = this.authService.getStoredUser();
        this.shareUsers = users.filter(user => user.id !== currentUser?.id);
        this.filteredShareUsers = this.shareUsers;
        this.hasLoadedShareUsers = true;
        this.loadingShareUsers = false;
      },
      error: () => {
        this.loadingShareUsers = false;
      }
    });
  }

  private mapDocToUnified(d: SharedWithMeItem | SharedByMeItem): UnifiedShareItem {
    return {
      itemType: 'document', id: d.id, resourceId: d.document_id,
      resourceTitle: d.document_title, ownerEmail: d.owner_email,
      recipientEmail: d.recipient_email, sharedAt: d.shared_at,
      expiresAt: d.expires_at, isActive: d.is_active, active: d.active,
      revokedAt: d.revoked_at, raw: d
    };
  }

  private mapConnToUnified(c: ConnectionSharedWithMeItem | ConnectionSharedByMeItem): UnifiedShareItem {
    return {
      itemType: 'connection', id: c.id, resourceId: c.connection_id,
      resourceTitle: c.connection_name, ownerEmail: c.owner_email,
      recipientEmail: c.recipient_email, sharedAt: c.shared_at,
      expiresAt: c.expires_at, isActive: c.is_active, active: c.active,
      revokedAt: c.revoked_at, raw: c
    };
  }

  private filterShareItems(items: UnifiedShareItem[], mode: 'recipient' | 'owner'): UnifiedShareItem[] {
    if (!this.searchQuery.trim()) {
      return items;
    }
    const query = this.searchQuery.trim().toLowerCase();
    return items.filter(item => {
      const targetEmail = mode === 'recipient' ? item.ownerEmail : item.recipientEmail;
      return [
        item.resourceTitle,
        item.resourceId,
        item.ownerEmail,
        item.recipientEmail,
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
