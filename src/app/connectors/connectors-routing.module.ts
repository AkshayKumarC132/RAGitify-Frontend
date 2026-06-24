import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConnectorsLayoutComponent } from './components/connectors-layout/connectors-layout.component';
import { WorkspaceConnectionsComponent } from './components/workspace-connections/workspace-connections.component';
import { PostgresWizardComponent } from './components/postgres-wizard/postgres-wizard.component';
import { ClickhouseWizardComponent } from './components/clickhouse-wizard/clickhouse-wizard.component';
import { ConnectionDetailsPageComponent } from './components/connection-details-page/connection-details-page.component';

const routes: Routes = [
    {
        path: '',
        component: ConnectorsLayoutComponent,
        children: [
            { path: '', component: WorkspaceConnectionsComponent },
            { path: 'new/postgres', component: PostgresWizardComponent },
            { path: 'new/clickhouse', component: ClickhouseWizardComponent },
            { path: ':id', component: ConnectionDetailsPageComponent }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ConnectorsRoutingModule { }
