import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Document } from '../../../shared/models/document.model';
import { DocumentService } from '../../../shared/services/document.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';

@Component({
  selector: 'app-document-sidebar-list',
  templateUrl: './document-sidebar-list.component.html',
  styleUrls: ['./document-sidebar-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentSidebarListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() libraryId: string | undefined | null = null;
  @Input() activeDocumentId: string | null = null;
  @Output() documentSelected = new EventEmitter<Document>();

  documents: Document[] = [];
  filteredDocuments: Document[] = [];
  searchQuery = '';
  loading = false;
  private destroy$ = new Subject<void>();

  constructor(
    private documentService: DocumentService,
    private router: Router,
    private route: ActivatedRoute,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.knowledgeContext.documentUploaded.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadDocuments();
    });
    this.knowledgeContext.sidebarSearch$.pipe(takeUntil(this.destroy$)).subscribe(query => {
      this.searchQuery = (query || '').toLowerCase();
      this.applyFilter();
      this.cdr.markForCheck();
    });
  }

  applyFilter(): void {
    if (!this.searchQuery) {
      this.filteredDocuments = this.documents;
      return;
    }
    this.filteredDocuments = this.documents.filter(doc => {
      const name = this.getDisplayName(doc).toLowerCase();
      return name.includes(this.searchQuery);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['libraryId'] && this.libraryId) {
      this.loadDocuments();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDocuments(): void {
    if (!this.libraryId) return;
    this.loading = true;
    this.cdr.markForCheck();
    this.documentService.list(this.libraryId, false).subscribe({
      next: (docs: Document[]) => {
        this.documents = docs;
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.documents = [];
        this.filteredDocuments = [];
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  selectDocument(doc: Document): void {
    this.documentSelected.emit(doc);
    this.router.navigate(['/workspace/document', doc.id], {
      queryParams: { libraryId: this.libraryId },
      queryParamsHandling: 'merge'
    });
  }

  getDisplayName(doc: Document): string {
    return (doc.title || doc.original_filename || 'Untitled').trim();
  }

  getTruncatedName(name: string): string {
    return name.length > 50 ? `${name.slice(0, 50)}...` : name;
  }

  getFileExt(doc: Document): string {
    const name = this.getDisplayName(doc);
    const parts = name.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toUpperCase().substring(0, 4);
    }
    return 'DOC';
  }

  getIconClass(doc: Document): string {
    const ext = this.getFileExt(doc);
    if (ext === 'JSON') return 'icon-json';
    if (ext === 'CSV' || ext === 'XLSX' || ext === 'XLS') return 'icon-xlsx';
    if (ext === 'PDF') return 'icon-pdf';
    if (ext === 'DOC' || ext === 'DOCX') return 'icon-docx';
    if (ext === 'TXT') return 'icon-txt';
    return 'icon-default';
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatSize(bytes: number | undefined): string {
    if (bytes == null) return '0 KB';
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }

  getStatusIcon(doc: Document): { class: string, title: string } | null {
    const status = (doc.ingestion_status || doc.status)?.toLowerCase();
    if (!status) return null;
    
    if (status === 'completed' || status === 'success') {
      return { class: 'fa-solid fa-circle-check', title: 'Completed' };
    }
    
    if (status === 'failed' || status.includes('fail') || status.includes('error')) {
      return { class: 'fa-solid fa-circle-exclamation', title: 'Failed' };
    }
    
    if (status === 'inprogress' || status.includes('progress') || status === 'queued' || status.includes('queued')) {
      return { class: 'fa-solid fa-circle-notch fa-spin', title: 'Processing' };
    }
    
    return null;
  }
}
