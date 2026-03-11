import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import Swal, { SweetAlertIcon } from 'sweetalert2/dist/sweetalert2.js';

@Injectable({
  providedIn: 'root'
})
export class ApiAlertService {
  private lastSignature = '';
  private lastShownAt = 0;

  showHttpError(error: HttpErrorResponse): void {
    const config = this.buildConfig(error);
    if (!config) {
      return;
    }

    const signature = `${error.status}:${config.title}:${config.text}`;
    const now = Date.now();
    if (this.lastSignature === signature && now - this.lastShownAt < 1800) {
      return;
    }

    this.lastSignature = signature;
    this.lastShownAt = now;

    void Swal.fire({
      icon: config.icon,
      title: config.title,
      text: config.text,
      confirmButtonText: 'OK',
      heightAuto: false
    });
  }

  private buildConfig(error: HttpErrorResponse): { icon: SweetAlertIcon; title: string; text: string } | null {
    if (error.error?.code === 'LLM_SETUP_REQUIRED') {
      return null;
    }

    const message = this.extractMessage(error);

    switch (error.status) {
      case 0:
        return { icon: 'error', title: 'Network error', text: 'Unable to reach the server. Check your connection and try again.' };
      case 400:
        return { icon: 'warning', title: 'Request rejected', text: message || 'The request could not be processed. Review the input and try again.' };
      case 401:
        return { icon: 'warning', title: 'Session expired', text: message || 'Your session is no longer valid. Please sign in again.' };
      case 403:
        return { icon: 'warning', title: 'Access denied', text: message || 'You do not have permission to perform this action.' };
      case 404:
        return { icon: 'info', title: 'Not found', text: message || 'The requested resource could not be found.' };
      case 409:
        return { icon: 'warning', title: 'Conflict detected', text: message || 'This action conflicts with the current server state.' };
      case 422:
        return { icon: 'warning', title: 'Validation failed', text: message || 'Some fields are invalid. Please review and try again.' };
      case 429:
        return { icon: 'warning', title: 'Too many requests', text: message || 'You are sending requests too quickly. Please wait a moment and retry.' };
      case 500:
        return { icon: 'error', title: 'Server error', text: message || 'The server failed to complete the request.' };
      case 502:
      case 503:
      case 504:
        return { icon: 'error', title: 'Service unavailable', text: message || 'The service is temporarily unavailable. Please try again shortly.' };
      default:
        return { icon: 'error', title: 'Request failed', text: message || 'Something went wrong while processing the request.' };
    }
  }

  private extractMessage(error: HttpErrorResponse): string {
    const payload = error.error;

    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim();
    }

    if (Array.isArray(payload?.non_field_errors) && payload.non_field_errors.length) {
      return payload.non_field_errors.join(', ');
    }

    if (payload && typeof payload === 'object') {
      for (const value of Object.values(payload)) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
        if (Array.isArray(value) && value.length) {
          return value.join(', ');
        }
      }
    }

    return '';
  }
}
