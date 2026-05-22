import { Injectable } from '@angular/core';
import Swal, { SweetAlertResult, SweetAlertIcon } from 'sweetalert2/dist/sweetalert2.js';

export interface ConfirmDialogConfig {
    title: string;
    message?: string;
    icon?: SweetAlertIcon;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
}

export interface PromptDialogConfig {
    title: string;
    message?: string;
    placeholder?: string;
    inputType?: 'text' | 'email' | 'password' | 'textarea';
    initialValue?: string;
    confirmText?: string;
    cancelText?: string;
    validator?: (value: string) => string | null;
}

/**
 * Centralised SweetAlert wrapper. Use this for true confirmations / prompts where
 * a blocking modal is genuinely required. For non-blocking notifications, use
 * ToastService instead.
 */
@Injectable({ providedIn: 'root' })
export class AppDialogService {
    /**
     * Show a yes/no confirmation. Resolves to true if confirmed, false otherwise.
     */
    async confirm(config: ConfirmDialogConfig): Promise<boolean> {
        const result = await Swal.fire({
            title: config.title,
            text: config.message,
            icon: config.icon ?? (config.danger ? 'warning' : 'question'),
            showCancelButton: true,
            confirmButtonText: config.confirmText ?? (config.danger ? 'Yes, delete' : 'Confirm'),
            cancelButtonText: config.cancelText ?? 'Cancel',
            confirmButtonColor: config.danger ? '#dc2626' : undefined,
            reverseButtons: true,
            focusCancel: !!config.danger,
            heightAuto: false
        });
        return !!result.isConfirmed;
    }

    /**
     * Show a plain alert (info / success / error). Resolves when dismissed.
     */
    async alert(title: string, message?: string, icon: SweetAlertIcon = 'info'): Promise<void> {
        await Swal.fire({
            title,
            text: message,
            icon,
            confirmButtonText: 'OK',
            heightAuto: false
        });
    }

    /**
     * Show an error modal. Use only when the user must explicitly acknowledge.
     */
    async error(title: string, message?: string): Promise<void> {
        await this.alert(title, message, 'error');
    }

    /**
     * Show a success modal. Prefer ToastService.success() unless the message
     * needs explicit acknowledgement.
     */
    async success(title: string, message?: string): Promise<void> {
        await this.alert(title, message, 'success');
    }

    /**
     * Prompt the user for a string value. Resolves to the entered value or null if cancelled.
     */
    async prompt(config: PromptDialogConfig): Promise<string | null> {
        const inputType = config.inputType === 'textarea' ? 'textarea' : (config.inputType ?? 'text');
        const result: SweetAlertResult = await Swal.fire({
            title: config.title,
            text: config.message,
            input: inputType,
            inputValue: config.initialValue ?? '',
            inputPlaceholder: config.placeholder,
            showCancelButton: true,
            confirmButtonText: config.confirmText ?? 'Save',
            cancelButtonText: config.cancelText ?? 'Cancel',
            reverseButtons: true,
            heightAuto: false,
            inputValidator: config.validator
                ? (value: string) => config.validator!(value) || undefined
                : undefined
        });
        return result.isConfirmed ? (result.value as string) : null;
    }

    /**
     * Show a transient loading modal. Returns a function to dismiss it.
     */
    loading(title: string = 'Working…'): () => void {
        Swal.fire({
            title,
            allowOutsideClick: false,
            allowEscapeKey: false,
            heightAuto: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading(null)
        });
        return () => Swal.close();
    }
}
