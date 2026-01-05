import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SetupLlmComponent } from './components/setup-llm/setup-llm.component';

const routes: Routes = [
  { path: '', component: SetupLlmComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SetupRoutingModule { }
