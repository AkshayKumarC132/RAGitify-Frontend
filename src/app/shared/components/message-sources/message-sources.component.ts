import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { Document } from '../../models/document.model';
import { DocumentService } from '../../services/document.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-message-sources',
  templateUrl: './message-sources.component.html',
  styleUrls: ['./message-sources.component.scss']
})
export class MessageSourcesComponent implements OnInit, OnChanges {
  @Input() documentIds: string[] = [];
  
  documents: (Document | null)[] = [];
  loading = false;
  isExpanded = false;

  constructor(private documentService: DocumentService) {}

  ngOnInit(): void {
    this.loadDocuments();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentIds'] && !changes['documentIds'].firstChange) {
      this.loadDocuments();
    }
  }

  private loadDocuments(): void {
    if (!this.documentIds || this.documentIds.length === 0) {
      this.documents = [];
      return;
    }

    this.loading = true;
    const documentRequests = this.documentIds.map(id =>
      this.documentService.getById(id).pipe(
        catchError(() => {
          // If document fetch fails, return null
          return of(null);
        })
      )
    );

    forkJoin(documentRequests).subscribe({
      next: (docs) => {
        this.documents = docs;
        this.loading = false;
      },
      error: () => {
        this.documents = [];
        this.loading = false;
      }
    });
  }

  getFileIcon(fileName: string): string {
    if (!fileName) return 'fa-file';
    
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'pdf':
        return 'fa-file-pdf';
      case 'xlsx':
      case 'xls':
        return 'fa-file-excel';
      case 'doc':
      case 'docx':
        return 'fa-file-word';
      case 'txt':
        return 'fa-file-lines';
      case 'csv':
        return 'fa-file-csv';
      default:
        return 'fa-file';
    }
  }

  getFileIconColor(fileName: string): string {
    if (!fileName) return '';
    
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'pdf':
        return 'pdf-color';
      case 'xlsx':
      case 'xls':
        return 'excel-color';
      case 'doc':
      case 'docx':
        return 'word-color';
      case 'ppt':
      case 'pptx':
        return 'powerpoint-color';
      default:
        return '';
    }
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  getDocumentCount(): number {
    return this.documentIds?.length || 0;
  }
}
