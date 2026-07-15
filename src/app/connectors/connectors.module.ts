import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { ConnectorsRoutingModule } from './connectors-routing.module';
import { ConnectorsLayoutComponent } from './components/connectors-layout/connectors-layout.component';
import { WorkspaceConnectionsComponent } from './components/workspace-connections/workspace-connections.component';
import { ConnectionDetailsPageComponent } from './components/connection-details-page/connection-details-page.component';
import { PostgresWizardComponent } from './components/postgres-wizard/postgres-wizard.component';
import { ClickhouseWizardComponent } from './components/clickhouse-wizard/clickhouse-wizard.component';
import { EditConnectionModalComponent } from './components/edit-connection-modal/edit-connection-modal.component';

@NgModule({
    declarations: [
        ConnectorsLayoutComponent,
        WorkspaceConnectionsComponent,
        ConnectionDetailsPageComponent,
        PostgresWizardComponent,
        ClickhouseWizardComponent,
        EditConnectionModalComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        SharedModule,
        ConnectorsRoutingModule
    ]
})
export class ConnectorsModule { }
