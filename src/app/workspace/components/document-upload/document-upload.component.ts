import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Document, IngestResponse } from '../../../shared/models/document.model';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStore } from '../../../shared/models/vector-store.model';

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  errorMessage?: string;
}

@Component({
  selector: 'app-document-upload',
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.scss']
})
export class DocumentUploadComponent implements OnChanges {
  @Input() vectorStores: VectorStore[] = [];
  @Input() defaultVectorStoreId: string | null = null;
  @Input() pendingFiles: File[] | null = null;
  @Output() uploaded = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  fileStatuses: FileUploadStatus[] = [];
  selectedVectorStoreId = '';
  loading = false;
  currentUploadIndex = -1;
  private hasProgressEvents = false;
  private lastUploadedDocumentId = '';
  errorMessage = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultVectorStoreId'] && this.defaultVectorStoreId) {
      this.selectedVectorStoreId = this.defaultVectorStoreId;
    }

    if (changes['vectorStores'] && this.vectorStores?.length === 1 && !this.selectedVectorStoreId) {
      this.selectedVectorStoreId = this.vectorStores[0].id;
    }

    if (changes['pendingFiles'] && this.pendingFiles && this.pendingFiles.length > 0) {
      this.fileStatuses = this.pendingFiles.map(file => ({
        file,
        status: 'pending' as const,
        progress: 0
      }));
      this.errorMessage = '';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      // Convert FileList to array and create status objects
      this.fileStatuses = Array.from(input.files).map(file => ({
        file,
        status: 'pending',
        progress: 0
      }));
      this.errorMessage = '';
    }
  }

  removeFile(index: number): void {
    if (!this.loading) {
      this.fileStatuses.splice(index, 1);
    }
  }

  onUpload(): void {
    if (this.fileStatuses.length === 0) {
      this.errorMessage = 'Please select file(s) to upload';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    
    // Set all to uploading
    this.fileStatuses.forEach(fs => {
      fs.status = 'uploading';
      fs.progress = 0;
    });
    this.hasProgressEvents = false;

    const files = this.fileStatuses.map(fs => fs.file);

    this.documentService.ingestWithProgress({
      files: files,
      vector_store_id: this.selectedVectorStoreId || undefined
    }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.hasProgressEvents = true;
          const total = event.total || 0;
          const computed = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
          const progressStep = this.calculateProgressStep(computed);
          this.fileStatuses.forEach(fs => fs.progress = progressStep);
          return;
        }

        if (event.type === HttpEventType.Response) {
          this.fileStatuses.forEach(fs => {
            fs.progress = 100;
            fs.status = 'completed';
          });

          // Capture the document ID from the response for navigation
          const body = event.body as any;
          if (body?.document_id) {
            this.lastUploadedDocumentId = body.document_id;
          } else if (body?.id) {
            this.lastUploadedDocumentId = body.id;
          }

          // Complete upload after a brief delay
          setTimeout(() => {
            this.loading = false;
            this.currentUploadIndex = -1;
            this.uploaded.emit(this.lastUploadedDocumentId);
          }, 300);
        }
      },
      error: (err) => {
        this.fileStatuses.forEach(fs => {
          fs.status = 'failed';
          fs.errorMessage = err.error?.error || 'Upload failed';
        });
        this.loading = false;
      }
    });
  }



  private calculateProgressStep(rawPercent: number): number {
    if (this.hasProgressEvents && rawPercent === 0) {
      return 0;
    }
    if (rawPercent < 25) {
      return 25;
    }
    if (rawPercent < 50) {
      return 50;
    }
    if (rawPercent < 70) {
      return 70;
    }
    if (rawPercent < 95) {
      return 95;
    }
    return 95;
  }

  getOverallStatus(): string {
    if (!this.loading) return '';

    return `Uploading ${this.fileStatuses.length} files...`;
  }

  getUploadButtonText(): string {
    const count = this.fileStatuses.length;
    if (count === 0) return 'Upload';
    if (count === 1) return 'Upload';
    return `Upload ${count} files`;
  }

  getTruncatedLibraryName(name: string | undefined | null): string {
    const safeName = (name || '').trim();
    if (safeName.length <= 25) {
      return safeName;
    }
    return `${safeName.slice(0, 25)}...`;
  }

  onCancel(): void {
    this.cancel.emit();
  }

  constructor(private documentService: DocumentService) { }
}
