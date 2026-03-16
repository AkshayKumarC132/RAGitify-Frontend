import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfirmDialogOptions } from '../components/confirm-dialog/confirm-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ConfirmDialogService {
  private dialogState$ = new BehaviorSubject<{ show: boolean; options: ConfirmDialogOptions | null }>({
    show: false,
    options: null
  });
  private resultSubject: { resolve: (value: any) => void; reject: () => void } | null = null;

  getDialogState(): Observable<{ show: boolean; options: ConfirmDialogOptions | null }> {
    return this.dialogState$.asObservable();
  }

  /**
   * Opens a confirmation dialog and returns a Promise that resolves to true if confirmed, false if cancelled
   */
  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      // If a dialog is already open, reject the new one
      if (this.dialogState$.value.show) {
        reject(new Error('Dialog already open'));
        return;
      }

      this.resultSubject = { resolve, reject };
      this.dialogState$.next({ show: true, options });
    });
  }

  /**
   * Opens a prompt dialog and returns a Promise that resolves to the string value if confirmed, null if cancelled
   */
  prompt(options: ConfirmDialogOptions): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      // If a dialog is already open, reject the new one
      if (this.dialogState$.value.show) {
        reject(new Error('Dialog already open'));
        return;
      }

      const promptOptions: ConfirmDialogOptions = {
        ...options,
        isPrompt: true,
        type: options.type || 'info'
      };

      this.resultSubject = {
        resolve: (val) => resolve(typeof val === 'string' ? val : null),
        reject
      };
      this.dialogState$.next({ show: true, options: promptOptions });
    });
  }

  /**
   * Closes the dialog with the given result
   */
  close(result: boolean | string): void {
    if (this.resultSubject) {
      this.resultSubject.resolve(result);
      this.resultSubject = null;
    }
    this.dialogState$.next({ show: false, options: null });
  }
}

