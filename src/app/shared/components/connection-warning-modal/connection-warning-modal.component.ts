import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FailedConnectionInfo } from '../../models/database-connection.model';

@Component({
  selector: 'app-connection-warning-modal',
  templateUrl: './connection-warning-modal.component.html',
  styleUrls: ['./connection-warning-modal.component.scss'],
})
export class ConnectionWarningModalComponent implements OnInit, OnDestroy {
  @Input() failedConnections: FailedConnectionInfo[] = [];

  /** Emitted when the user wants to retry with the same connections. */
  @Output() retry = new EventEmitter<void>();

  /** Emitted with the connection id when the user clicks "Edit Connection". */
  @Output() editConnection = new EventEmitter<string>();

  /** Emitted when the user dismisses the modal without acting. */
  @Output() dismiss = new EventEmitter<void>();

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.onDismiss();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('cwm-backdrop')) {
      this.onDismiss();
    }
  }

  onRetry(): void {
    this.retry.emit();
  }

  onEdit(id: string): void {
    this.editConnection.emit(id);
  }

  onDismiss(): void {
    this.dismiss.emit();
  }

  /** Maps a backend error code to a Font Awesome icon class. */
  getErrorIcon(code: string): string {
    const map: Record<string, string> = {
      DATABASE_AUTHENTICATION_FAILED: 'fa-solid fa-key',
      DATABASE_CREDENTIAL_EXPIRED: 'fa-solid fa-clock-rotate-left',
      DATABASE_ACCESS_DENIED: 'fa-solid fa-ban',
      DATABASE_NOT_FOUND: 'fa-solid fa-database',
      DATABASE_CONNECTION_TIMEOUT: 'fa-solid fa-hourglass-half',
      DATABASE_HOST_UNREACHABLE: 'fa-solid fa-wifi',
      DATABASE_TLS_ERROR: 'fa-solid fa-shield-halved',
      DATABASE_CREDENTIAL_CONFIGURATION_ERROR: 'fa-solid fa-gear',
      DATABASE_CONNECTION_FAILED: 'fa-solid fa-plug-circle-xmark',
    };
    return map[code] ?? 'fa-solid fa-circle-exclamation';
  }

  /** Maps a backend error code to a CSS class that drives the accent colour. */
  getErrorClass(code: string): string {
    const auth = new Set([
      'DATABASE_AUTHENTICATION_FAILED',
      'DATABASE_CREDENTIAL_EXPIRED',
      'DATABASE_CREDENTIAL_CONFIGURATION_ERROR',
    ]);
    const access = new Set(['DATABASE_ACCESS_DENIED']);
    const network = new Set([
      'DATABASE_HOST_UNREACHABLE',
      'DATABASE_CONNECTION_TIMEOUT',
      'DATABASE_TLS_ERROR',
    ]);

    if (auth.has(code)) return 'err-auth';
    if (access.has(code)) return 'err-access';
    if (network.has(code)) return 'err-network';
    return 'err-generic';
  }
}
