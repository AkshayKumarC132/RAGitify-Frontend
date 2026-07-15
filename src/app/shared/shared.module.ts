import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ApiErrorAlertInterceptor } from './interceptors/api-error-alert.interceptor';
import { LoadingInterceptor } from './interceptors/loading.interceptor';
import { RetryInterceptor } from './interceptors/retry.interceptor';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { ThreadSearchPopupComponent } from './components/thread-search-popup/thread-search-popup.component';
import { MessageSourcesComponent } from './components/message-sources/message-sources.component';
import { FormatTimePipe } from './pipes/format-time.pipe';
import { ToastComponent } from './components/toast/toast.component';
import { SkeletonComponent } from './components/skeleton/skeleton.component';
import { TopProgressComponent } from './components/top-progress/top-progress.component';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { DocPreviewDirective } from './directives/doc-preview.directive';

import { TypingLabelComponent } from './components/typing-label/typing-label.component';
import { TypingIndicatorComponent } from './components/typing-indicator/typing-indicator.component';
import { MessageBubbleComponent } from './components/message-bubble/message-bubble.component';
import { TaskListComponent } from './components/task-list/task-list.component';

@NgModule({
  declarations: [ThemeToggleComponent, TypingLabelComponent, ConfirmDialogComponent, ThreadSearchPopupComponent, MessageSourcesComponent, TypingIndicatorComponent, MessageBubbleComponent, FormatTimePipe, ToastComponent, SkeletonComponent, TopProgressComponent, CommandPaletteComponent, DocPreviewDirective, TaskListComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    ScrollingModule
  ],
  providers: [
    ApiService,
    AuthService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoadingInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiErrorAlertInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: RetryInterceptor,
      multi: true
    }
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ScrollingModule,
    ThemeToggleComponent,
    TypingLabelComponent,
    ConfirmDialogComponent,
    ThreadSearchPopupComponent,
    MessageSourcesComponent,
    TypingIndicatorComponent,
    MessageBubbleComponent,
    FormatTimePipe,
    ToastComponent,
    SkeletonComponent,
    TopProgressComponent,
    CommandPaletteComponent,
    DocPreviewDirective,
    TaskListComponent
  ]
})
export class SharedModule { }
