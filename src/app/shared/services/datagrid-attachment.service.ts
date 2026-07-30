import { Injectable } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AttachedDataGrid } from '../models/conversation.model';

@Injectable({
  providedIn: 'root'
})
export class DatagridAttachmentService {
  private attachedDataGridSubject = new BehaviorSubject<AttachedDataGrid | null>(null);
  public attachedDataGrid$ = this.attachedDataGridSubject.asObservable();

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart)
    ).subscribe(() => {
      this.clearAttachment();
    });
  }

  /**
   * Attach a DataGrid to the conversation context
   */
  attachDataGrid(id: number, name: string, rowCount?: number, columns?: string[]): void {
    this.attachedDataGridSubject.next({ id, name, row_count: rowCount, columns });
  }

  /**
   * Clear the currently attached DataGrid
   */
  clearAttachment(): void {
    this.attachedDataGridSubject.next(null);
  }

  /**
   * Get the current attached DataGrid synchronously
   */
  getCurrentAttachment(): AttachedDataGrid | null {
    return this.attachedDataGridSubject.getValue();
  }
}
