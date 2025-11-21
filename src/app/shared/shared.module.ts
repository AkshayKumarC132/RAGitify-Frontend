import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';
import { NgModule } from '@angular/core';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

import { TypingLabelComponent } from './components/typing-label/typing-label.component';

@NgModule({
  declarations: [ThemeToggleComponent, TypingLabelComponent],
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MarkdownModule.forRoot()
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
    MarkdownModule
  ]
})
export class SharedModule { }

