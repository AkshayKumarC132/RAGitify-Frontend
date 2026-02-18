import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SettingsLayoutComponent } from './components/settings-layout/settings-layout.component';
import { GeneralSectionComponent } from './components/general-section/general-section.component';
import { ModelsSectionComponent } from './components/models-section/models-section.component';
import { AccountSectionComponent } from './components/account-section/account-section.component';

const routes: Routes = [
  {
    path: '',
    component: SettingsLayoutComponent,
    children: [
      { path: '', redirectTo: 'general', pathMatch: 'full' },
      { path: 'general', component: GeneralSectionComponent },
      { path: 'models', component: ModelsSectionComponent },
      { path: 'account', component: AccountSectionComponent },
      { path: 'profile', component: AccountSectionComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingsRoutingModule { }

