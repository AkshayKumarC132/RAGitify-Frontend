import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DatabaseConnection } from '../../../shared/models/database-connection.model';

@Component({
    selector: 'app-edit-connection-modal',
    templateUrl: './edit-connection-modal.component.html',
    styleUrls: ['./edit-connection-modal.component.scss']
})
export class EditConnectionModalComponent implements OnInit {
    @Input() connection!: DatabaseConnection;
    @Input() loading = false;
    @Output() close = new EventEmitter<void>();
    @Output() save = new EventEmitter<Partial<DatabaseConnection>>();

    editData: Partial<DatabaseConnection> = {};
    showPassword = false;

    ngOnInit(): void {
        // Password is intentionally blank and must be re-entered to save edits.
        this.editData = {
            name: this.connection.name || '',
            host: this.connection.host || '',
            port: this.connection.port || 5432,
            database_name: this.connection.database_name || '',
            schema_name: this.connection.schema_name || '',
            username: this.connection.username || '',
            password: ''
        };
    }

    onClose(): void {
        if (!this.loading) {
            this.close.emit();
        }
    }

    togglePasswordVisibility(): void {
        this.showPassword = !this.showPassword;
    }

    isValid(): boolean {
        return !!(
            this.editData.name &&
            this.editData.host &&
            this.editData.port &&
            this.editData.database_name &&
            this.editData.username &&
            this.editData.password &&
            this.editData.password.trim().length > 0
        );
    }

    onSave(): void {
        if (!this.isValid() || this.loading) return;

        const payload: Partial<DatabaseConnection> = {
            name: this.editData.name,
            host: this.editData.host,
            port: Number(this.editData.port),
            database_name: this.editData.database_name,
            schema_name: this.editData.schema_name,
            username: this.editData.username,
            password: this.editData.password || ''
        };

        this.save.emit(payload);
    }
}
