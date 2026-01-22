import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Document } from '../../../shared/models/document.model';
import { DocumentService } from '../../../shared/services/document.service';
import { VectorStore } from '../../../shared/models/vector-store.model';

@Component({
  selector: 'app-document-upload',
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.scss']
})
export class DocumentUploadComponent implements OnChanges {
  @Input() vectorStores: VectorStore[] = [];
  @Input() defaultVectorStoreId: string | null = null;
  @Output() uploaded = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  selectedFile: File | null = null;
  selectedVectorStoreId = '';
  loading = false;
  uploadProgress = 0;
  uploadStatus = '';
  errorMessage = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultVectorStoreId'] && this.defaultVectorStoreId) {
      this.selectedVectorStoreId = this.defaultVectorStoreId;
    }

    if (changes['vectorStores'] && this.vectorStores?.length === 1 && !this.selectedVectorStoreId) {
      this.selectedVectorStoreId = this.vectorStores[0].id;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  onUpload(): void {
    if (!this.selectedFile || !this.selectedVectorStoreId) {
      this.errorMessage = 'Please select a file and library destination';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.uploadProgress = 0;
    this.uploadStatus = 'Uploading...';

    this.documentService.ingestWithProgress({
      file: this.selectedFile,
      vector_store_id: this.selectedVectorStoreId
    }).subscribe({
      next: (event: HttpEvent<Document>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 0;
          if (total > 0) {
            const computed = Math.round((event.loaded / total) * 100);
            this.uploadProgress = Math.min(95, computed);
            this.uploadStatus = `Uploading... ${this.uploadProgress}%`;
          } else {
            this.uploadProgress = 0;
            this.uploadStatus = 'Uploading...';
          }
          return;
        }

        if (event.type === HttpEventType.Response) {
          this.uploadProgress = 100;
          this.uploadStatus = 'Upload complete.';
          this.loading = false;
          this.uploaded.emit();
        }
      },
      error: (err) => {
        this.loading = false;
        this.uploadStatus = '';
        this.errorMessage = err.error?.error || 'Upload failed';
      }
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  constructor(private documentService: DocumentService) {}
}
