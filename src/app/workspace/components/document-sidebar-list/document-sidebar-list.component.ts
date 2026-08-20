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

  getFileIcon(doc: Document): string {
    const ext = this.getFileExtension(doc);
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

  getFileIconTone(doc: Document): string {
    const ext = this.getFileExtension(doc);
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

  private getFileExtension(doc: Document): string {
    const name = this.getDisplayName(doc);
    const parts = name.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
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
