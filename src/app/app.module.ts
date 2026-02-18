import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from './shared/shared.module';
import { AppComponent } from './app.component';
import { AuthGuard } from './auth/guards/auth.guard';
import { LlmReadyGuard } from './auth/guards/llm-ready.guard';

const routes: Routes = [
  { path: '', redirectTo: '/auth', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule) },
  { path: 'setup-llm', loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule), canActivate: [AuthGuard] },
  { path: 'home', loadChildren: () => import('./home/home.module').then(m => m.HomeModule), canActivate: [AuthGuard, LlmReadyGuard] },
  { path: 'temporary-chat', loadChildren: () => import('./home/home.module').then(m => m.HomeModule), canActivate: [AuthGuard, LlmReadyGuard] },
  { path: 'workspace', loadChildren: () => import('./workspace/workspace.module').then(m => m.WorkspaceModule), canActivate: [AuthGuard, LlmReadyGuard] },
  { path: 'settings', loadChildren: () => import('./settings/settings.module').then(m => m.SettingsModule), canActivate: [AuthGuard, LlmReadyGuard] },
  { path: '**', redirectTo: '/auth' }
];

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    RouterModule.forRoot(routes),
    SharedModule
  ],
  providers: [AuthGuard, LlmReadyGuard],
  bootstrap: [AppComponent]
})
export class AppModule { }
