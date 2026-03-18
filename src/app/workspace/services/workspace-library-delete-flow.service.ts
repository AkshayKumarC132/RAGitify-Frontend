import { Injectable } from '@angular/core';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { Document } from '../../shared/models/document.model';
import { VectorStore } from '../../shared/models/vector-store.model';
import { DocumentService } from '../../shared/services/document.service';
import { VectorStoreService } from '../../shared/services/vector-store.service';

interface DeleteLibraryCallbacks {
  onDeleted?: () => void;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceLibraryDeleteFlowService {
  constructor(
    private vectorStoreService: VectorStoreService,
    private documentService: DocumentService
  ) {}

  async openDeleteLibraryFlow(
    store: VectorStore,
    vectorStores: VectorStore[],
    documents: Document[],
    callbacks: DeleteLibraryCallbacks = {}
  ): Promise<void> {
    const documentCount = documents.filter(document => document.vector_store === store.id).length;
    const shortSafeStoreName = this.escapeHtml(this.truncateText(store.name, 20));
    const moveTargets = vectorStores.filter(target =>
      target.id !== store.id &&
      target.vs_type !== 'SHARED'
    );

    if (documentCount === 0) {
      const confirm = await Swal.fire({
        title: 'Delete Library',
        icon: 'warning',
        iconHtml: '<i class="fa-solid fa-trash-can"></i>',
        width: 460,
        html: `
          <div class="library-delete-empty-modal">
            <p class="library-delete-empty-copy">
              Are you sure you want to delete "<b>${shortSafeStoreName}</b>"?<br>
            </p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        focusCancel: true,
        customClass: {
          popup: 'ragitify-swal-empty-popup',
          title: 'ragitify-swal-empty-title',
          htmlContainer: 'ragitify-swal-empty-html',
          actions: 'ragitify-swal-empty-actions',
          confirmButton: 'ragitify-swal-empty-confirm',
          cancelButton: 'ragitify-swal-empty-cancel'
        }
      });
      if (confirm.isConfirmed) {
        this.executeDeleteLibrary(store, false, callbacks);
      }
      return;
    }

    const moveTargetOptions = moveTargets
      .map(target => `<option value="${target.id}">${this.truncateText(target.name, 25)} (${target.vs_type || 'CUSTOM'})</option>`)
      .join('');

    const result = await Swal.fire({
      title: 'Delete Library',
      icon: 'warning',
      iconHtml: '<i class="fa-solid fa-trash-can"></i>',
      width: 430,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      customClass: {
        popup: 'ragitify-swal-popup',
        htmlContainer: 'ragitify-swal-html',
        actions: 'ragitify-swal-actions',
        confirmButton: 'ragitify-swal-confirm',
        cancelButton: 'ragitify-swal-cancel'
      },
      html: `
        <div class="library-delete-modal">
          <p class="library-delete-copy">
            <strong>${documentCount}</strong> document${documentCount === 1 ? '' : 's'} are still inside "${shortSafeStoreName}".
          </p>
          <label class="library-delete-option library-delete-option-move">
            <input type="radio" name="library-delete-action" value="move" ${moveTargets.length ? 'checked' : 'disabled'}>
            <span class="library-delete-option-content">
              <span class="library-delete-option-title">Move documents to another library, then delete this library</span>
              <span class="library-delete-option-subtitle">Choose a destination and keep all files available.</span>
            </span>
          </label>
          <div class="library-delete-move">
            <select id="libraryDeleteTarget" class="swal2-select" ${moveTargets.length ? '' : 'disabled'}>
              <option value="">Select destination</option>
              ${moveTargetOptions}
            </select>
          </div>
          <label class="library-delete-option library-delete-option-hard-delete">
            <input type="radio" name="library-delete-action" value="hard-delete" ${moveTargets.length ? '' : 'checked'}>
            <span class="library-delete-option-content">
              <span class="library-delete-option-title">Delete this library and permanently remove all documents inside it</span>
              <span class="library-delete-option-subtitle">This action cannot be undone.</span>
            </span>
          </label>
          <label class="library-delete-checkbox">
            <input id="libraryDeleteAcknowledge" type="checkbox">
            <span>I understand documents in this library will be deleted and cannot be recovered.</span>
          </label>
        </div>
      `,
      didOpen: () => {
        const container = Swal.getHtmlContainer();
        if (!container) {
          return;
        }
        const confirmButton = Swal.getConfirmButton();
        const moveRadio = container.querySelector<HTMLInputElement>('input[value="move"]');
        const hardDeleteRadio = container.querySelector<HTMLInputElement>('input[value="hard-delete"]');
        const moveSelect = container.querySelector<HTMLSelectElement>('#libraryDeleteTarget');
        const moveSelectWrapper = container.querySelector<HTMLElement>('.library-delete-move');
        const acknowledge = container.querySelector<HTMLInputElement>('#libraryDeleteAcknowledge');
        const acknowledgeWrapper = container.querySelector<HTMLElement>('.library-delete-checkbox');
        const moveOption = container.querySelector<HTMLElement>('.library-delete-option-move');
        const hardDeleteOption = container.querySelector<HTMLElement>('.library-delete-option-hard-delete');
        const syncState = () => {
          if (!moveSelect || !acknowledge || !moveRadio || !hardDeleteRadio || !confirmButton || !acknowledgeWrapper) {
            return;
          }
          const moving = moveRadio.checked;
          moveSelect.disabled = !moving;
          if (moveSelectWrapper) {
            moveSelectWrapper.style.display = moving ? 'block' : 'none';
          }
          acknowledgeWrapper.style.display = moving ? 'none' : 'grid';
          acknowledge.disabled = moving;
          acknowledge.checked = moving ? false : acknowledge.checked;
          acknowledgeWrapper.classList.toggle('active', !moving);
          moveOption?.classList.toggle('is-selected', moving);
          hardDeleteOption?.classList.toggle('is-selected', !moving);
          moveOption?.classList.toggle('is-disabled', moveRadio.disabled);
          hardDeleteOption?.classList.toggle('is-disabled', hardDeleteRadio.disabled);
          const canContinue = moving
            ? !!moveSelect.value.trim()
            : acknowledge.checked;
          confirmButton.disabled = !canContinue;
        };
        moveRadio?.addEventListener('change', syncState);
        hardDeleteRadio?.addEventListener('change', syncState);
        moveSelect?.addEventListener('change', syncState);
        acknowledge?.addEventListener('change', syncState);
        syncState();
      },
      preConfirm: () => {
        const container = Swal.getHtmlContainer();
        if (!container) {
          return null;
        }
        const selectedAction = container.querySelector<HTMLInputElement>('input[name="library-delete-action"]:checked')?.value;
        const moveTargetId = (container.querySelector<HTMLSelectElement>('#libraryDeleteTarget')?.value || '').trim();
        const acknowledge = !!container.querySelector<HTMLInputElement>('#libraryDeleteAcknowledge')?.checked;

        if (selectedAction === 'move') {
          if (!moveTargetId) {
            Swal.showValidationMessage('Select a destination library before continuing.');
            return null;
          }
          return { action: 'move', moveTargetId };
        }

        if (!acknowledge) {
          Swal.showValidationMessage('Confirm that deleting this library will also remove its documents.');
          return null;
        }

        return { action: 'hard-delete', moveTargetId: null };
      }
    });

    if (!result.isConfirmed || !result.value) {
      return;
    }

    if (result.value.action === 'move' && result.value.moveTargetId) {
      this.moveDocumentsAndDeleteLibrary(store, result.value.moveTargetId, documents, callbacks);
      return;
    }

    this.executeDeleteLibrary(store, true, callbacks);
  }

  private moveDocumentsAndDeleteLibrary(
    store: VectorStore,
    targetStoreId: string,
    documents: Document[],
    callbacks: DeleteLibraryCallbacks
  ): void {
    const documentsToMove = documents.filter(document => document.vector_store === store.id);
    if (!documentsToMove.length) {
      this.executeDeleteLibrary(store, false, callbacks);
      return;
    }

    void Swal.fire({
      title: 'Moving documents',
      text: 'Requesting a server-side move before deleting this library.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.documentService.move({
      document_ids: documentsToMove.map(document => document.id),
      target_vector_store_id: targetStoreId
    }).subscribe({
      next: () => {
        this.executeDeleteLibrary(store, false, callbacks, 'Documents moved successfully. Library removed.');
      },
      error: (err) => {
        console.error('Error moving documents:', err);
        void Swal.fire({
          title: 'Unable to move documents',
          text: this.extractErrorMessage(err, 'The selected library could not be deleted because the document move failed.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  private executeDeleteLibrary(
    store: VectorStore,
    hardDelete: boolean,
    callbacks: DeleteLibraryCallbacks,
    successMessage?: string
  ): void {
    void Swal.fire({
      title: hardDelete ? 'Deleting library and documents' : 'Deleting library',
      text: hardDelete ? 'Removing the library and all of its documents.' : 'Removing the library now.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.vectorStoreService.delete(store.id, { hardDelete }).subscribe({
      next: () => {
        callbacks.onDeleted?.();
        void Swal.fire({
          icon: 'success',
          iconHtml: '<i class="fa-solid fa-check"></i>',
          title: 'Library deleted',
          html: `
            <div class="ragitify-swal-success-body">
              <p class="ragitify-swal-success-copy">
                <strong>"${this.escapeHtml(this.truncateText(store.name, 20))}"</strong> was deleted successfully.
              </p>
              <div class="ragitify-swal-success-meta">
                ${this.escapeHtml(successMessage || 'The library has been removed from your workspace.')}
              </div>
            </div>
          `,
          confirmButtonText: 'Done',
          customClass: {
            popup: 'ragitify-swal-success-popup',
            title: 'ragitify-swal-success-title',
            htmlContainer: 'ragitify-swal-success-html',
            actions: 'ragitify-swal-success-actions',
            confirmButton: 'ragitify-swal-success-confirm'
          }
        });
      },
      error: (err) => {
        console.error('Error deleting library:', err);
        void Swal.fire({
          title: 'Unable to delete library',
          text: this.extractErrorMessage(err, 'The library could not be deleted.'),
          icon: 'error',
          confirmButtonText: 'Close'
        });
      }
    });
  }

  private extractErrorMessage(error: any, fallback: string): string {
    if (error?.error) {
      if (typeof error.error === 'string') {
        return error.error;
      }
      if (typeof error.error?.detail === 'string') {
        return error.error.detail;
      }
      if (typeof error.error?.error === 'string') {
        return error.error.error;
      }
      if (typeof error.error === 'object') {
        const firstKey = Object.keys(error.error)[0];
        if (firstKey) {
          const value = error.error[firstKey];
          if (Array.isArray(value)) {
            return value.join(', ');
          }
          if (typeof value === 'string') {
            return value;
          }
        }
      }
    }
    return fallback;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private truncateText(value: string, maxLength: number): string {
    const safeValue = (value || '').trim();
    if (safeValue.length <= maxLength) {
      return safeValue;
    }
    return `${safeValue.slice(0, maxLength)}...`;
  }
}
