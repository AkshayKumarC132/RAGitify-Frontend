import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { Document, DocumentVersion } from '../../../shared/models/document.model';
import { SharedByMeItem, SharedWithMeItem } from '../../../shared/models/document-share.model';
import { User } from '../../../shared/models/user.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { AuthService } from '../../../shared/services/auth.service';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { WorkspaceLibraryDeleteFlowService } from '../../services/workspace-library-delete-flow.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-document-details-page',
  templateUrl: './document-details-page.component.html',
  styleUrls: ['./document-details-page.component.scss']
})
export class DocumentDetailsPageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() documentId: string | null = null;

  loading = false;
  errorMessage = '';
  document: Document | null = null;
  vectorStore: VectorStore | null = null;
  vectorStores: VectorStore[] = [];
  @ViewChild('createLibraryNameInput') createLibraryNameInput?: ElementRef<HTMLInputElement>;
  allDocuments: Document[] = [];
  sharedWithMe: SharedWithMeItem[] = [];
  sharedByMe: SharedByMeItem[] = [];
  shareDialogOpen = false;
  shareSubmitting = false;
  shareTargetEmail = '';
  shareExpiresAt = '';
  shareUsers: User[] = [];
  filteredShareUsers: User[] = [];
  loadingShareUsers = false;
  showShareUserDropdown = false;
  private hasLoadedShareUsers = false;
  editingVectorStore: VectorStore | null = null;
  chatLibrary: VectorStore | null = null;
  editVectorStoreForm: FormGroup;
  showCreateLibraryModal = false;
  createLibraryForm: FormGroup;
  createLibraryError = '';
  showUploadForm = false;
  showDocumentChat = false;
  private destroy$ = new Subject<void>();
  private statusPollTimer: ReturnType<typeof setTimeout> | null = null;
  summaryCopied = false;

  // Version history
  versions: DocumentVersion[] = [];
  versionsLoading = false;
  versionsLoaded = false;
  versionsError = '';
  restoringVersionId: number | null = null;
  showVersionsPanel = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private documentService: DocumentService,
    private documentShareService: DocumentShareService,
    private vectorStoreService: VectorStoreService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private libraryDeleteFlow: WorkspaceLibraryDeleteFlowService,
    private confirmDialogService: ConfirmDialogService,
    private toast: ToastService
  ) {
    this.editVectorStoreForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
    this.createLibraryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit(): void {
    this.knowledgeContext.editLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
      this.startVectorStoreEdit(store);
    });

    this.knowledgeContext.deleteLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
      void this.deleteVectorStore(store);
    });

    this.knowledgeContext.chatLibraryRequested.pipe(takeUntil(this.destroy$)).subscribe(store => {
      this.openLibraryChat(store);
    });

    this.knowledgeContext.openNewLibraryPanel.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.openCreateLibraryModal();
    });

    this.knowledgeContext.openUploadPanel.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.showUploadForm = true;
    });
  }

  onDocumentUploaded(documentId: string): void {
    this.showUploadForm = false;
    this.knowledgeContext.documentUploaded.next();
    if (documentId) {
      this.router.navigate(['/workspace/document', documentId], {
        queryParams: this.currentLibraryId ? { libraryId: this.currentLibraryId } : {}
      });
    } else {
      this.loadDetails();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId']) {
      this.loadDetails();
    }
  }

  ngOnDestroy(): void {
    this.stopStatusPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get documentName(): string {
    return this.document?.title || this.document?.original_filename || this.getSharedTitleFallback() || 'Document';
  }

  get shareCount(): number {
    return this.sharedWithMe.length + this.sharedByMe.length;
  }

  get isShareTargetValid(): boolean {
    const email = this.shareTargetEmail.trim().toLowerCase();
    if (!email) {
      return false;
    }
    return this.shareUsers.some(user => (user.email || '').toLowerCase() === email);
  }

  get canShareDocument(): boolean {
    return !!this.document
      && this.document.access_type !== 'shared'
      && (this.document.ingestion_status || this.document.status) === 'completed';
  }

  get hasFailed(): boolean {
    if (!this.document) return false;
    const status = (this.document.ingestion_status || this.document.status || '').toLowerCase();
    return status === 'failed';
  }

  get currentLibraryId(): string | null {
    return this.route.snapshot.queryParamMap.get('libraryId');
  }

  get truncatedLibraryName(): string {
    const name = this.vectorStore?.name || this.currentLibraryId || '-';
    return name.length > 50 ? `${name.slice(0, 50)}...` : name;
  }

  get metadataEntries(): Array<{ key: string; value: string }> {
    const metadata = this.document?.metadata || {};
    return Object.entries(metadata).map(([key, value]) => ({
      key,
      value: this.formatValue(value)
    }));
  }

  get documentSummary(): string {
    const summary = (this.document as any)?.summary;
    return typeof summary === 'string' && summary.trim()
      ? summary.trim()
      : 'No summary is available for this document yet.';
  }

  copySummary(): void {
    if (this.documentSummary && this.documentSummary !== 'No summary is available for this document yet.') {
      navigator.clipboard.writeText(this.documentSummary).then(() => {
        this.summaryCopied = true;
        this.cdr.detectChanges();
        this.toast.success('Copied to clipboard', 'Document summary copied.');
        setTimeout(() => {
          this.summaryCopied = false;
          this.cdr.detectChanges();
        }, 2000);
      }).catch(() => {
        this.toast.error('Copy failed', 'Could not access the clipboard.');
      });
    }
  }

  // ─── Version history ────────────────────────────────────────────────
  toggleVersionsPanel(): void {
    this.showVersionsPanel = !this.showVersionsPanel;
    if (this.showVersionsPanel && !this.versionsLoaded && !this.versionsLoading) {
      this.loadVersions();
    }
  }

  loadVersions(): void {
    if (!this.documentId) {
      return;
    }
    this.versionsLoading = true;
    this.versionsError = '';
    this.documentService.listVersions(this.documentId).subscribe({
      next: (rows) => {
        this.versions = rows || [];
        this.versionsLoading = false;
        this.versionsLoaded = true;
      },
      error: (err) => {
        this.versionsLoading = false;
        this.versionsError = err?.error?.error || 'Could not load version history.';
        this.toast.error('Version history unavailable', this.versionsError);
      }
    });
  }

  async restoreVersion(version: DocumentVersion): Promise<void> {
    if (!this.documentId || this.restoringVersionId !== null) {
      return;
    }
    const confirmed = await this.confirmDialogService.confirm({
      title: `Restore version ${version.version_number}?`,
      message: 'The current document will be snapshotted first so the restore is reversible. The document will be re-processed.',
      itemName: this.document?.title || 'this document',
      confirmText: 'Restore',
      type: 'warning',
    }).catch(() => false);
    if (!confirmed) {
      return;
    }

    this.restoringVersionId = version.id;
    this.documentService.restoreVersion(this.documentId, version.id).subscribe({
      next: (restored) => {
        this.restoringVersionId = null;
        this.document = restored;
        this.toast.success('Version restored', `Document rolled back to v${version.version_number}.`);
        // Refresh the version list so the pre-restore snapshot shows up at the top.
        this.versionsLoaded = false;
        this.loadVersions();
      },
      error: (err) => {
        this.restoringVersionId = null;
        const message = err?.error?.error || 'Could not restore this version.';
        this.toast.error('Restore failed', message);
      }
    });
  }

  trackVersionById(_: number, version: DocumentVersion): number {
    return version.id;
  }

  formatVersionDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  formatVersionSize(bytes: number | null | undefined): string {
    if (!bytes && bytes !== 0) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
  }

  get documentKeywords(): string[] {
    const keywords = (this.document as any)?.keywords;

    if (Array.isArray(keywords)) {
      return keywords
        .map(keyword => String(keyword).trim())
        .filter(Boolean);
    }

    if (typeof keywords === 'string' && keywords.trim()) {
      return keywords
        .split(',')
        .map(keyword => keyword.trim())
        .filter(Boolean);
    }

    return [];
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  }

  formatFileSize(size?: number): string {
    if (size == null) {
      return 'Unknown';
    }

    if (size === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
  }

  getShareStatus(item: SharedWithMeItem | SharedByMeItem): string {
    if (item.revoked_at) {
      return 'Revoked';
    }
    if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) {
      return 'Expired';
    }
    return item.active || item.is_active ? 'Active' : 'Inactive';
  }

  getStatusColor(status: string | undefined | null): string {
    if (!status) return 'inherit';
    const s = status.toLowerCase();
    if (s === 'failed' || s.includes('fail') || s.includes('error')) return 'red';
    if (s === 'success' || s === 'completed' || s.includes('success')) return 'green';
    if (s === 'inprogress' || s.includes('progress') || s === 'queued' || s.includes('queued')) return 'orange';
    return 'inherit';
  }

  private loadDetails(): void {
    this.stopStatusPolling();

    if (!this.documentId) {
      this.document = null;
      this.vectorStore = null;
      this.sharedWithMe = [];
      this.sharedByMe = [];
      this.errorMessage = 'Document ID is required.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      document: this.documentService.getById(this.documentId).pipe(
        catchError(err => {
          this.errorMessage = this.extractErrorMessage(err, 'Unable to load the requested document.');
          return of(null);
        })
      ),
      vectorStores: this.vectorStoreService.list().pipe(catchError(() => of([] as VectorStore[]))),
      documents: this.documentService.list(undefined, false).pipe(catchError(() => of([] as Document[]))),
      sharedWithMe: this.documentShareService.listSharedWithMe().pipe(catchError(() => of([] as SharedWithMeItem[]))),
      sharedByMe: this.documentShareService.listSharedByMe().pipe(catchError(() => of([] as SharedByMeItem[])))
    }).subscribe({
      next: ({ document, vectorStores, documents, sharedWithMe, sharedByMe }) => {
        this.document = document;
        this.vectorStores = vectorStores;
        this.allDocuments = documents;
        this.vectorStore = document
          ? vectorStores.find(store => store.id === document.vector_store) || null
          : vectorStores.find(store => store.id === this.currentLibraryId) || null;
        this.sharedWithMe = sharedWithMe.filter(item => item.document_id === this.documentId);
        this.sharedByMe = sharedByMe.filter(item => item.document_id === this.documentId);

        if (!this.document && this.shareCount === 0 && !this.errorMessage) {
          this.errorMessage = 'Document details are unavailable for this file.';
        }

        this.loading = false;

        // If the document is already in a terminal state when the details page
        // is opened, the status poller won't run and never fires documentUploaded.
        // Eagerly invalidate the list cache and notify the sidebar so it
        // refreshes any stale "inprogress" entry right away.
        const currentStatus = document?.ingestion_status || document?.status;
        if (this.isTerminalStatus(currentStatus)) {
          this.documentService.invalidateListCache();
          this.knowledgeContext.documentUploaded.next();
        }

        this.startStatusPolling();
      },
      error: () => {
        this.errorMessage = 'Unable to load the requested document.';
        this.loading = false;
      }
    });
  }

  private isTerminalStatus(status: string | undefined | null): boolean {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'completed' || s === 'failed';
  }

  isQueuedStatus(status: string | undefined | null): boolean {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'inprogress' || s.includes('progress') || s === 'queued' || s.includes('queued');
  }

  private startStatusPolling(): void {
    this.stopStatusPolling();

    if (!this.document || !this.documentId) return;

    const currentStatus = this.document.ingestion_status || this.document.status;
    if (this.isTerminalStatus(currentStatus)) return;

    this.statusPollTimer = setTimeout(() => {
      if (!this.documentId) return;

      this.documentService.getStatus(this.documentId).subscribe({
        next: (statusResponse: any) => {
          console.log('[Status Poll] Got status:', statusResponse.status);
          if (this.document) {
            this.document = {
              ...this.document,
              ingestion_status: statusResponse.status,
              status: statusResponse.status
            };
            this.cdr.detectChanges();
          }

          if (this.isTerminalStatus(statusResponse.status)) {
            this.documentService.invalidateListCache();
            this.knowledgeContext.documentUploaded.next();
            this.loadDetails();
          } else {
            this.startStatusPolling();
          }
        },
        error: () => {
          // Retry on error
          this.startStatusPolling();
        }
      });
    }, 5000);
  }

  private stopStatusPolling(): void {
    if (this.statusPollTimer !== null) {
      clearTimeout(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }

  getSharedTitleFallback(): string | null {
    return this.sharedWithMe[0]?.document_title || this.sharedByMe[0]?.document_title || null;
  }

  openShareDialog(): void {
    if (!this.document || !this.canShareDocument) {
      void Swal.fire({
        title: 'Nothing to share',
        text: 'Only your completed documents can be shared with another user.',
        icon: 'info',
        confirmButtonText: 'Close'
      });
      return;
    }

    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
    this.showShareUserDropdown = false;
    this.loadShareUsers();
    this.shareDialogOpen = true;
  }

  closeShareDialog(): void {
    this.shareDialogOpen = false;
    this.shareSubmitting = false;
    this.showShareUserDropdown = false;
    this.shareTargetEmail = '';
    this.shareExpiresAt = '';
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
    if (!this.document || !email || this.shareSubmitting || !this.isShareTargetValid) {
      return;
    }

    this.shareSubmitting = true;
    this.documentShareService.share({
      document_ids: [this.document.id],
      target_user_email: email,
      expires_at: this.shareExpiresAt ? new Date(this.shareExpiresAt).toISOString() : null
    }).subscribe({
      next: (response) => {
        this.shareSubmitting = false;
        this.closeShareDialog();
        this.loadDetails();
        void Swal.fire({
          icon: 'success',
          iconHtml: '<i class="fa-solid fa-check"></i>',
          title: 'Share updated',
          html: `
            <div class="ragitify-swal-success-body">
              <p class="ragitify-swal-success-copy">
                <strong>${response.shared_count}</strong> document${response.shared_count === 1 ? '' : 's'} shared successfully.
              </p>
              <div class="ragitify-swal-success-meta">
                The selected recipient can now access the shared document${response.shared_count === 1 ? '' : 's'}.
              </div>
            </div>
          `,
          confirmButtonText: 'Done',
          customClass: {
            popup: 'ragitify-swal-success-popup',
            title: 'ragitify-swal-success-title',
            htmlContainer: 'ragitify-swal-success-html',
            actions: 'ragitify-swal-success-actions',
            confirmButton: 'ragitify-swal-success-confirm'
          }
        });
      },
      error: (err) => {
        this.shareSubmitting = false;
        void Swal.fire({
          title: 'Unable to share document',
          text: this.extractErrorMessage(err, 'The share request could not be completed.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  openCreateLibraryModal(): void {
    this.createLibraryForm.reset();
    this.createLibraryError = '';
    this.showCreateLibraryModal = true;
    setTimeout(() => this.createLibraryNameInput?.nativeElement.focus(), 0);
  }

  cancelCreateLibrary(): void {
    this.showCreateLibraryModal = false;
    this.createLibraryForm.reset();
    this.createLibraryError = '';
  }

  submitCreateLibrary(): void {
    if (this.createLibraryForm.invalid) {
      this.createLibraryForm.markAllAsTouched();
      return;
    }
    const { name } = this.createLibraryForm.value;
    this.vectorStoreService.create({ name }).subscribe({
      next: (store) => {
        const updatedStores = [store, ...this.vectorStores];
        this.vectorStores = updatedStores;
        this.knowledgeContext.updateState({
          vectorStores: updatedStores,
          selectedVectorStore: this.vectorStore
        });
        this.cancelCreateLibrary();
      },
      error: (err) => {
        this.createLibraryError = this.extractErrorMessage(err, 'Unable to create library.');
      }
    });
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
      next: updated => {
        this.vectorStores = this.vectorStores.map(store =>
          store.id === updated.id ? { ...store, name: updated.name } : store
        );
        if (this.vectorStore?.id === updated.id) {
          this.vectorStore = { ...updated };
        }
        this.knowledgeContext.updateState({
          vectorStores: this.vectorStores,
          selectedVectorStore: this.vectorStore
        });
        this.cancelVectorStoreEdit();
      },
      error: err => {
        this.errorMessage = this.extractErrorMessage(err, 'Unable to update library.');
      }
    });
  }

  async deleteVectorStore(store: VectorStore): Promise<void> {
    if (store.is_system) {
      this.errorMessage = `${store.name} is a system library and cannot be deleted.`;
      return;
    }

    await this.libraryDeleteFlow.openDeleteLibraryFlow(store, this.vectorStores, this.allDocuments, {
      onDeleted: () => {
        this.vectorStores = this.vectorStores.filter(item => item.id !== store.id);
        if (this.vectorStore?.id === store.id) {
          this.vectorStore = null;
        }
        if (this.chatLibrary?.id === store.id) {
          this.chatLibrary = null;
        }
        this.cancelVectorStoreEdit();
        this.knowledgeContext.updateState({
          vectorStores: this.vectorStores,
          selectedVectorStore: this.vectorStore
        });
        this.loadDetails();
      }
    });
  }

  openLibraryChat(store: VectorStore): void {
    this.chatLibrary = store;
  }

  closeLibraryChat(): void {
    this.chatLibrary = null;
  }

  openDocumentChat(): void {
    this.showDocumentChat = true;
  }

  closeDocumentChat(): void {
    this.showDocumentChat = false;
  }

  async deleteDocument(): Promise<void> {
    if (!this.documentId || !this.document) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete document?',
      message: 'This will delete',
      itemName: this.documentName,
      secondaryMessage: 'This cannot be undone.'
    });

    if (!confirmed) return;

    this.documentService.delete(this.documentId).subscribe({
      next: () => {
        this.knowledgeContext.documentUploaded.next();
        this.router.navigate(['/workspace'], {
          queryParams: this.currentLibraryId ? { libraryId: this.currentLibraryId } : {}
        });
      },
      error: (err: unknown) => {
        console.error('Error deleting document:', err);
        this.errorMessage = this.extractErrorMessage(err, 'Unable to delete document.');
      }
    });
  }

  private formatValue(value: unknown): string {
    if (value == null) {
      return '-';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  closeDetails(): void {
    this.router.navigate(['/workspace'], {
      queryParams: this.currentLibraryId ? { libraryId: this.currentLibraryId } : {}
    });
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const candidate = error as { error?: { error?: string; detail?: string; message?: string }; message?: string };
    return candidate?.error?.error || candidate?.error?.detail || candidate?.error?.message || candidate?.message || fallback;
  }

  private loadShareUsers(): void {
    if (this.loadingShareUsers || this.hasLoadedShareUsers) {
      return;
    }

    this.loadingShareUsers = true;
    this.authService.listUsers().subscribe({
      next: (users: User[]) => {
        const currentUser = this.authService.getStoredUser();
        this.shareUsers = users.filter((user: User) => user.id !== currentUser?.id);
        this.filteredShareUsers = this.shareUsers;
        this.hasLoadedShareUsers = true;
        this.loadingShareUsers = false;
      },
      error: () => {
        this.loadingShareUsers = false;
      }
    });
  }
}


