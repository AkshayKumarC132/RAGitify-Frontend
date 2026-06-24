import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { SettingsLayoutComponent } from './components/settings-layout/settings-layout.component';
import { ModelsSectionComponent } from './components/models-section/models-section.component';
import { GeneralSectionComponent } from './components/general-section/general-section.component';
import { AccountSectionComponent } from './components/account-section/account-section.component';
import { SkillsSectionComponent } from './components/skills-section/skills-section.component';
import { UsageSectionComponent } from './components/usage-section/usage-section.component';
import { SettingsRoutingModule } from './settings-routing.module';

@NgModule({
  declarations: [
    SettingsLayoutComponent,
    ModelsSectionComponent,
    GeneralSectionComponent,
    AccountSectionComponent,
    SkillsSectionComponent,
    UsageSectionComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    SettingsRoutingModule
  ]
})
export class SettingsModule { }

