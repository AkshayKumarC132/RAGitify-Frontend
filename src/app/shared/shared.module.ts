import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ApiErrorAlertInterceptor } from './interceptors/api-error-alert.interceptor';
import { LoadingInterceptor } from './interceptors/loading.interceptor';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { ThreadSearchPopupComponent } from './components/thread-search-popup/thread-search-popup.component';
import { MessageSourcesComponent } from './components/message-sources/message-sources.component';
import { FormatTimePipe } from './pipes/format-time.pipe';
import { ToastComponent } from './components/toast/toast.component';

import { TypingLabelComponent } from './components/typing-label/typing-label.component';
import { TypingIndicatorComponent } from './components/typing-indicator/typing-indicator.component';
import { MessageBubbleComponent } from './components/message-bubble/message-bubble.component';

@NgModule({
  declarations: [ThemeToggleComponent, TypingLabelComponent, ConfirmDialogComponent, ThreadSearchPopupComponent, MessageSourcesComponent, TypingIndicatorComponent, MessageBubbleComponent, FormatTimePipe, ToastComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule
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
    }
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ThemeToggleComponent,
    TypingLabelComponent,
    ConfirmDialogComponent,
    ThreadSearchPopupComponent,
    MessageSourcesComponent,
    TypingIndicatorComponent,
    MessageBubbleComponent,
    FormatTimePipe,
    ToastComponent
  ]
})
export class SharedModule { }
