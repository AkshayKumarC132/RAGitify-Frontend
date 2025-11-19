import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
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

    this.documentService.ingest({
      file: this.selectedFile,
      vector_store_id: this.selectedVectorStoreId
    }).subscribe({
      next: () => {
        this.loading = false;
        this.uploadProgress = 100;
        this.uploaded.emit();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error || 'Upload failed';
      }
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  constructor(private documentService: DocumentService) {}
}

