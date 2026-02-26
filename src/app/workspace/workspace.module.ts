import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { WorkspaceLayoutComponent } from './components/workspace-layout/workspace-layout.component';
import { KnowledgeSectionComponent } from './components/knowledge-section/knowledge-section.component';
import { PromptsSectionComponent } from './components/prompts-section/prompts-section.component';
import { ToolsSectionComponent } from './components/tools-section/tools-section.component';
import { DocumentUploadComponent } from './components/document-upload/document-upload.component';
import { VectorStoreListComponent } from './components/vector-store-list/vector-store-list.component';
import { AssistantFormComponent } from './components/assistant-form/assistant-form.component';
import { DocumentChatComponent } from './components/document-chat/document-chat.component';
import { AssistantChatComponent } from './components/assistant-chat/assistant-chat.component';
import { LibraryChatComponent } from './components/library-chat/library-chat.component';
import { WorkspaceLibraryPickerComponent } from './components/workspace-library-picker/workspace-library-picker.component';
import { WorkspaceRoutingModule } from './workspace-routing.module';

@NgModule({
  declarations: [
    WorkspaceLayoutComponent,
    WorkspaceLibraryPickerComponent,
    KnowledgeSectionComponent,
    PromptsSectionComponent,
    ToolsSectionComponent,
    DocumentUploadComponent,
    VectorStoreListComponent,
    AssistantFormComponent,
    DocumentChatComponent,
    AssistantChatComponent,
    LibraryChatComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    WorkspaceRoutingModule
  ]
})
export class WorkspaceModule { }

