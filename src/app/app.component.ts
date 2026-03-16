import { Component, OnInit } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { ConfirmDialogService } from './shared/services/confirm-dialog.service';
import { ThreadSearchPopupService } from './shared/services/thread-search-popup.service';
import { Observable } from 'rxjs';
import { ConfirmDialogOptions } from './shared/components/confirm-dialog/confirm-dialog.component';
import { Conversation } from './shared/models/conversation.model';
import { LoadingService } from './shared/services/loading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'RAGitify';
  dialogState$: Observable<{ show: boolean; options: ConfirmDialogOptions | null }>;
  searchPopupState$: Observable<{ show: boolean; threads: Conversation[]; currentThread: Conversation | null }>;
  loading$: Observable<boolean>;
  loaderLabel$: Observable<string>;

  constructor(
    private authService: AuthService,
    private confirmDialogService: ConfirmDialogService,
    private threadSearchPopupService: ThreadSearchPopupService,
    private loadingService: LoadingService
  ) {
    this.dialogState$ = this.confirmDialogService.getDialogState();
    this.searchPopupState$ = this.threadSearchPopupService.getPopupState();
    this.loading$ = this.loadingService.loading$;
    this.loaderLabel$ = this.loadingService.label$;
  }

  ngOnInit(): void {
    this.authService.ensureValidSession();
  }

  onDialogConfirmed(result: boolean | string): void {
    this.confirmDialogService.close(result);
  }

  onSearchPopupClosed(): void {
    this.threadSearchPopupService.close();
  }

  onThreadSelected(thread: Conversation): void {
    this.threadSearchPopupService.selectThread(thread);
  }
}
