import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { HomeComponent } from './components/home/home.component';
import { ChatContainerComponent } from './components/chat-container/chat-container.component';
import { ChatInputComponent } from './components/chat-input/chat-input.component';
import { ModelSelectorComponent } from './components/model-selector/model-selector.component';
import { ThreadSidebarComponent } from './components/thread-sidebar/thread-sidebar.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { PlaygroundComponent } from './components/playground/playground.component';
import { PostgresConnectionModalComponent } from './components/postgres-connection-modal/postgres-connection-modal.component';
import { HomeRoutingModule } from './home-routing.module';

@NgModule({
  declarations: [
    HomeComponent,
    ChatContainerComponent,
    ChatInputComponent,
    ModelSelectorComponent,
    ThreadSidebarComponent,
    EmptyStateComponent,
    PlaygroundComponent,
    PostgresConnectionModalComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    HomeRoutingModule
  ]
})
export class HomeModule { }

