import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { OAuthCallbackComponent } from './components/oauth-callback/oauth-callback.component';
import { UnauthenticatedOnlyGuard } from './guards/unauthenticated-only.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [UnauthenticatedOnlyGuard] },
  // RegisterComponent is a pane inside the login card: it needs `isActive` to
  // load tenants, and its "Back to Login" output is wired up by the parent.
  // Routing straight to it rendered a chrome-less form with a dead back button
  // and an empty workspace picker, so /auth/register now opens the login shell
  // with the Create Account tab already selected.
  { path: 'register', component: LoginComponent, canActivate: [UnauthenticatedOnlyGuard], data: { mode: 'register' } },
  { path: 'forgot-password', component: ForgotPasswordComponent, canActivate: [UnauthenticatedOnlyGuard] },
  { path: 'reset-password', component: ResetPasswordComponent, canActivate: [UnauthenticatedOnlyGuard] },
  // OAuth callback must NOT have the unauth guard — completing the flow needs
  // to run even though we'll be authenticated by the time we return.
  { path: 'oauth-callback', component: OAuthCallbackComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }

