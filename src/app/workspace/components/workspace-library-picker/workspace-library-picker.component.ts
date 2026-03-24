import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { Document } from '../../../shared/models/document.model';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { WorkspaceLibraryDeleteFlowService } from '../../services/workspace-library-delete-flow.service';

@Component({
  selector: 'app-workspace-library-picker',
  templateUrl: './workspace-library-picker.component.html',
  styleUrls: ['./workspace-library-picker.component.scss']
})
export class WorkspaceLibraryPickerComponent implements OnInit {
  @ViewChild('createLibraryInput') createLibraryInput?: ElementRef<HTMLInputElement>;
  @ViewChild('renameLibraryInput') renameLibraryInput?: ElementRef<HTMLInputElement>;
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
  showFailedView = false;
  showProcessingView = false;

  get filteredVectorStores(): VectorStore[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.vectorStores;
    return this.vectorStores.filter(s => {
      const matchingDocuments = this.documents
        .filter(doc => doc.vector_store === s.id)
        .map(doc => [doc.title, doc.original_filename, doc.file_type].filter(Boolean).join(' '))
        .join(' ');

      const haystack = [
        s.name,
        s.vs_type,
        s.collection,
        this.getStoreHint(s),
        matchingDocuments
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

  get failedDocumentGroups(): { libraryName: string, documents: Document[] }[] {
    const failedVsIds = Array.from(new Set(
      this.documents
        .filter(doc => this.getResolvedStatus(doc) === 'failed')
        .map(doc => doc.vector_store)
    ));
    
    return failedVsIds.map(vsId => {
      const store = this.vectorStores.find(s => s.id === vsId);
      const libraryName = store ? this.getDisplayLibraryName(store.name) : 'Unknown Library';
      const libraryDocs = this.documents.filter(doc => doc.vector_store === vsId);
      return { libraryName, documents: libraryDocs };
    }).sort((a, b) => a.libraryName.localeCompare(b.libraryName));
  }

  get processingDocumentGroups(): { libraryName: string, documents: Document[] }[] {
    const processingVsIds = Array.from(new Set(
      this.documents
        .filter(doc => ['queued', 'processing', 'in_progress'].includes(this.getResolvedStatus(doc)))
        .map(doc => doc.vector_store)
    ));
    
    return processingVsIds.map(vsId => {
      const store = this.vectorStores.find(s => s.id === vsId);
      const libraryName = store ? this.getDisplayLibraryName(store.name) : 'Unknown Library';
      const libraryDocs = this.documents.filter(doc => doc.vector_store === vsId);
      return { libraryName, documents: libraryDocs };
    }).sort((a, b) => a.libraryName.localeCompare(b.libraryName));
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
    private router: Router,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private libraryDeleteFlow: WorkspaceLibraryDeleteFlowService
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

  getDisplayLibraryName(name: string, maxLength = 20): string {
    const safeName = (name || '').trim();
    if (!safeName) {
      return '';
    }
    if (safeName.length <= maxLength) {
      return safeName;
    }
    return `${safeName.slice(0, maxLength)}...`;
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

  isProtectedStore(store: VectorStore): boolean {
    return store.vs_type === 'DEFAULT' || store.vs_type === 'SHARED';
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

  selectDocument(doc: Document): void {
    this.router.navigate(['/workspace/document', doc.id], { 
      queryParams: { libraryId: doc.vector_store } 
    });
  }

  openLibraryChat(store: VectorStore): void {
    this.knowledgeContext.requestPendingLibraryChat(store);
    this.router.navigate(['/workspace'], {
      queryParams: { libraryId: store.id }
    });
  }

  openSharedWithMe(): void {
    const sharedStore = this.vectorStores.find(store => store.vs_type === 'SHARED');
    if (!sharedStore) {
      return;
    }

    this.router.navigate(['/workspace'], {
      queryParams: {
        libraryId: sharedStore.id,
        workspaceTab: 'shared-with-me'
      }
    });
  }

  setGridView(value: boolean): void {
    this.gridView = value;
  }

  toggleFailedView(): void {
    if (this.totalFailedDocuments > 0 || this.showFailedView) {
      this.showFailedView = !this.showFailedView;
      if (this.showFailedView) {
        this.showProcessingView = false;
      }
    }
  }

  toggleProcessingView(): void {
    if (this.totalProcessingDocuments > 0 || this.showProcessingView) {
      this.showProcessingView = !this.showProcessingView;
      if (this.showProcessingView) {
        this.showFailedView = false;
      }
    }
  }

  showAllLibraries(): void {
    this.showFailedView = false;
    this.showProcessingView = false;
  }

  editLibrary(store: VectorStore): void {
    if (!this.canEdit(store)) {
      return;
    }
    this.renameTarget = store;
    this.renameName = store.name || '';
    this.errorMessage = '';
    this.focusRenameInput();
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
    void this.libraryDeleteFlow.openDeleteLibraryFlow(store, this.vectorStores, this.documents, {
      onDeleted: () => {
        this.vectorStores = this.vectorStores.filter(s => s.id !== store.id);
        this.loadDocumentCounts();
      }
    });
  }

  createLibrary(): void {
    this.creating = true;
    this.createName = '';
    this.errorMessage = '';
    this.focusCreateInput();
  }

  private focusCreateInput(): void {
    setTimeout(() => this.createLibraryInput?.nativeElement.focus(), 0);
  }

  private focusRenameInput(): void {
    setTimeout(() => this.renameLibraryInput?.nativeElement.focus(), 0);
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

  getResolvedStatus(document: Document): string {
    return document.ingestion_status || document.status || 'queued';
  }

  getFileExt(doc: Document): string {
    const name = (doc.title || doc.original_filename || 'Untitled').trim();
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toUpperCase().substring(0, 4);
    }
    return 'DOC';
  }

  formatSize(bytes: number | undefined): string {
    if (bytes == null) return '0 KB';
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }

}
