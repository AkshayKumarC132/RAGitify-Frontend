import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { SettingsLayoutComponent } from './components/settings-layout/settings-layout.component';
import { ModelsSectionComponent } from './components/models-section/models-section.component';
import { GeneralSectionComponent } from './components/general-section/general-section.component';
import { AccountSectionComponent } from './components/account-section/account-section.component';
import { SettingsRoutingModule } from './settings-routing.module';

@NgModule({
  declarations: [
    SettingsLayoutComponent,
    ModelsSectionComponent,
    GeneralSectionComponent,
    AccountSectionComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    SettingsRoutingModule
  ]
})
export class SettingsModule { }

