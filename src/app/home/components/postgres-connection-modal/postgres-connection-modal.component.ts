import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-postgres-connection-modal',
  templateUrl: './postgres-connection-modal.component.html',
  styleUrls: ['./postgres-connection-modal.component.scss']
})
export class PostgresConnectionModalComponent {
  @Output() closeModal = new EventEmitter<void>();
  @Output() saveConnection = new EventEmitter<any>();
  @Output() testConnection = new EventEmitter<any>();

  showPassword = false;
  connection = {
    name: '',
    host: '',
    port: 5432,
    databaseName: '',
    username: '',
    password: ''
  };

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onCancel(): void {
    this.closeModal.emit();
  }

  onTest(): void {
    if (this.isValid()) {
      this.testConnection.emit(this.connection);
    }
  }

  onSave(): void {
    if (this.isValid()) {
      this.saveConnection.emit(this.connection);
      this.closeModal.emit();
    }
  }

  isValid(): boolean {
    return !!(this.connection.name && this.connection.host && this.connection.port && this.connection.databaseName &&
      this.connection.username && this.connection.password);
  }
}
