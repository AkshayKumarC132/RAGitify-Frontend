import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { OAuthCallbackComponent } from './components/oauth-callback/oauth-callback.component';
import { UnauthenticatedOnlyGuard } from './guards/unauthenticated-only.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [UnauthenticatedOnlyGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [UnauthenticatedOnlyGuard] },
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

