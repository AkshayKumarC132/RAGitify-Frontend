import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Document } from '../../../shared/models/document.model';
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
  @Output() uploaded = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  fileStatuses: FileUploadStatus[] = [];
  selectedVectorStoreId = '';
  loading = false;
  currentUploadIndex = -1;
  private hasProgressEvents = false;
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
    if (this.fileStatuses.length === 0 || !this.selectedVectorStoreId) {
      this.errorMessage = 'Please select file(s) and library destination';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.currentUploadIndex = 0;
    this.uploadNextFile();
  }

  private uploadNextFile(): void {
    if (this.currentUploadIndex >= this.fileStatuses.length) {
      // All files processed
      this.loading = false;
      this.currentUploadIndex = -1;
      this.uploaded.emit();
      return;
    }

    const fileStatus = this.fileStatuses[this.currentUploadIndex];
    fileStatus.status = 'uploading';
    fileStatus.progress = 0;
    this.hasProgressEvents = false;

    this.documentService.ingestWithProgress({
      file: fileStatus.file,
      vector_store_id: this.selectedVectorStoreId
    }).subscribe({
      next: (event: HttpEvent<Document>) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.hasProgressEvents = true;
          const total = event.total || 0;
          const computed = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
          fileStatus.progress = this.calculateProgressStep(computed);
          return;
        }

        if (event.type === HttpEventType.Response) {
          fileStatus.progress = 100;
          fileStatus.status = 'completed';

          // Move to next file after a brief delay
          setTimeout(() => {
            this.currentUploadIndex++;
            this.uploadNextFile();
          }, 300);
        }
      },
      error: (err) => {
        fileStatus.status = 'failed';
        fileStatus.errorMessage = err.error?.error || 'Upload failed';

        // Continue with next file even if this one failed
        setTimeout(() => {
          this.currentUploadIndex++;
          this.uploadNextFile();
        }, 300);
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

    const completed = this.fileStatuses.filter(f => f.status === 'completed').length;
    const total = this.fileStatuses.length;

    if (this.currentUploadIndex >= 0 && this.currentUploadIndex < total) {
      return `Uploading file ${this.currentUploadIndex + 1} of ${total}...`;
    }

    return `Processing ${completed} of ${total} files...`;
  }

  getUploadButtonText(): string {
    const count = this.fileStatuses.length;
    if (count === 0) return 'Upload';
    if (count === 1) return 'Upload';
    return `Upload ${count} files`;
  }

  onCancel(): void {
    this.cancel.emit();
  }

  constructor(private documentService: DocumentService) { }
}
