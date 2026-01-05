import { Component, OnInit } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { ConfirmDialogService } from './shared/services/confirm-dialog.service';
import { ThreadSearchPopupService } from './shared/services/thread-search-popup.service';
import { Observable } from 'rxjs';
import { ConfirmDialogOptions } from './shared/components/confirm-dialog/confirm-dialog.component';
import { Thread } from './shared/models/thread.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'RAG Application';
  dialogState$: Observable<{ show: boolean; options: ConfirmDialogOptions | null }>;
  searchPopupState$: Observable<{ show: boolean; threads: Thread[]; currentThread: Thread | null }>;

  constructor(
    private authService: AuthService,
    private confirmDialogService: ConfirmDialogService,
    private threadSearchPopupService: ThreadSearchPopupService
  ) {
    this.dialogState$ = this.confirmDialogService.getDialogState();
    this.searchPopupState$ = this.threadSearchPopupService.getPopupState();
  }

  ngOnInit(): void {
    this.authService.ensureValidSession();
  }

  onDialogConfirmed(result: boolean): void {
    this.confirmDialogService.close(result);
  }

  onSearchPopupClosed(): void {
    this.threadSearchPopupService.close();
  }

  onThreadSelected(thread: Thread): void {
    this.threadSearchPopupService.selectThread(thread);
  }
}

