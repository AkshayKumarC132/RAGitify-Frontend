import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { WorkspaceLayoutComponent } from './components/workspace-layout/workspace-layout.component';

const routes: Routes = [
  { path: '', component: WorkspaceLayoutComponent },
  { path: 'library/:libraryId/stats', component: WorkspaceLayoutComponent },
  { path: 'document/:documentId', component: WorkspaceLayoutComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WorkspaceRoutingModule { }

