import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { SetupRoutingModule } from './setup-routing.module';
import { SetupLlmComponent } from './components/setup-llm/setup-llm.component';

@NgModule({
  declarations: [SetupLlmComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    SetupRoutingModule
  ]
})
export class SetupModule { }
