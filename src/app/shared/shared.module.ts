import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { ThreadSearchPopupComponent } from './components/thread-search-popup/thread-search-popup.component';

import { TypingLabelComponent } from './components/typing-label/typing-label.component';

@NgModule({
  declarations: [ThemeToggleComponent, TypingLabelComponent, ConfirmDialogComponent, ThreadSearchPopupComponent],
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
    ThreadSearchPopupComponent
  ]
})
export class SharedModule { }
