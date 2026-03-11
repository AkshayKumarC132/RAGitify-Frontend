import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Document } from '../../../shared/models/document.model';
import { SharedByMeItem, SharedWithMeItem } from '../../../shared/models/document-share.model';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { DocumentService } from '../../../shared/services/document.service';
import { DocumentShareService } from '../../../shared/services/document-share.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';

@Component({
  selector: 'app-document-details-page',
  templateUrl: './document-details-page.component.html',
  styleUrls: ['./document-details-page.component.scss']
})
export class DocumentDetailsPageComponent implements OnChanges {
  @Input() documentId: string | null = null;

  loading = false;
  errorMessage = '';
  document: Document | null = null;
  vectorStore: VectorStore | null = null;
  sharedWithMe: SharedWithMeItem[] = [];
  sharedByMe: SharedByMeItem[] = [];

  constructor(
    private documentService: DocumentService,
    private documentShareService: DocumentShareService,
    private vectorStoreService: VectorStoreService,
    private route: ActivatedRoute
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId']) {
      this.loadDetails();
    }
  }

  get documentName(): string {
    return this.document?.original_filename || this.document?.title || this.getSharedTitleFallback() || 'Document';
  }

  get shareCount(): number {
    return this.sharedWithMe.length + this.sharedByMe.length;
  }

  get currentLibraryId(): string | null {
    return this.route.snapshot.queryParamMap.get('libraryId');
  }

  get metadataEntries(): Array<{ key: string; value: string }> {
    const metadata = this.document?.metadata || {};
    return Object.entries(metadata).map(([key, value]) => ({
      key,
      value: this.formatValue(value)
    }));
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

  private loadDetails(): void {
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
      sharedWithMe: this.documentShareService.listSharedWithMe().pipe(catchError(() => of([] as SharedWithMeItem[]))),
      sharedByMe: this.documentShareService.listSharedByMe().pipe(catchError(() => of([] as SharedByMeItem[])))
    }).subscribe({
      next: ({ document, vectorStores, sharedWithMe, sharedByMe }) => {
        this.document = document;
        this.vectorStore = document
          ? vectorStores.find(store => store.id === document.vector_store) || null
          : vectorStores.find(store => store.id === this.currentLibraryId) || null;
        this.sharedWithMe = sharedWithMe.filter(item => item.document_id === this.documentId);
        this.sharedByMe = sharedByMe.filter(item => item.document_id === this.documentId);

        if (!this.document && this.shareCount === 0 && !this.errorMessage) {
          this.errorMessage = 'Document details are unavailable for this file.';
        }

        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Unable to load the requested document.';
        this.loading = false;
      }
    });
  }

  getSharedTitleFallback(): string | null {
    return this.sharedWithMe[0]?.document_title || this.sharedByMe[0]?.document_title || null;
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    const candidate = error as { error?: { detail?: string; message?: string }; message?: string };
    return candidate?.error?.detail || candidate?.error?.message || candidate?.message || fallback;
  }
}
