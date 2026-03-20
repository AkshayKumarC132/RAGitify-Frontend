import { Component, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Document } from '../../../shared/models/document.model';
import { DocumentService } from '../../../shared/services/document.service';

@Component({
  selector: 'app-document-sidebar-list',
  templateUrl: './document-sidebar-list.component.html',
  styleUrls: ['./document-sidebar-list.component.scss']
})
export class DocumentSidebarListComponent implements OnChanges {
  @Input() libraryId: string | undefined | null = null;
  @Input() activeDocumentId: string | null = null;
  @Output() documentSelected = new EventEmitter<Document>();

  documents: Document[] = [];
  loading = false;

  constructor(
    private documentService: DocumentService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['libraryId'] && this.libraryId) {
      this.loadDocuments();
    }
  }

  loadDocuments(): void {
    if (!this.libraryId) return;
    this.loading = true;
    this.documentService.list(this.libraryId, false).subscribe({
      next: (docs: Document[]) => {
        this.documents = docs;
        this.loading = false;
      },
      error: () => {
        this.documents = [];
        this.loading = false;
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
    if (ext === 'CSV' || ext === 'XLSX') return 'icon-csv';
    return 'icon-txt';
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
}
