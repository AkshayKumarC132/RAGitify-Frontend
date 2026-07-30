import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { ContextItem } from '../../models/conversation.model';

/** Internal display item enriched with icon/colour metadata */
export interface ContextRailItem extends ContextItem {
  iconClasses: string[];
  iconColor: string;
  iconUrl: string | null;
  displayName: string; // truncated ≤ 15 chars
}

@Component({
  selector: 'app-context-rail',
  templateUrl: './context-rail.component.html',
  styleUrls: ['./context-rail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextRailComponent implements OnChanges {
  /** File attachments from message metadata */
  @Input() documents: Array<{ id: string; name: string }> = [];
  /** Database/connector attachments from message metadata */
  @Input() connectors: Array<{ id: string; name: string; type: string }> = [];
  /** Attached datagrid (reply-privileged) */
  @Input() attachedDatagrid: { id: number; name: string; row_count?: number } | null = null;
  /** How many items to show before the +N overflow button. 0 = auto (based on item count) */
  @Input() maxVisible: number = 0;

  /** Emitted when user clicks the datagrid card to scroll to it */
  @Output() datagridClick = new EventEmitter<number>();

  allItems: ContextRailItem[] = [];
  popoverOpen = false;

  ngOnChanges(changes: SimpleChanges): void {
    this.buildItems();
  }

  private buildItems(): void {
    const items: ContextRailItem[] = [];

    for (const doc of (this.documents || [])) {
      const sub = this.detectFileSubType(doc.name);
      items.push({
        type: 'file',
        id: doc.id,
        name: doc.name,
        subType: sub,
        ...this.fileIconInfo(sub),
        displayName: this.truncate(doc.name)
      });
    }

    for (const con of (this.connectors || [])) {
      const sub = this.detectDbSubType(con.type);
      items.push({
        type: 'database',
        id: con.id,
        name: con.name,
        subType: sub,
        ...this.dbIconInfo(sub),
        displayName: this.truncate(con.name)
      });
    }

    this.allItems = items;
  }

  // ── Computed getters ────────────────────────────────────────────────

  get effectiveMaxVisible(): number {
    // Auto-calculate: show 2 chips when there are >2 items, else show all
    if (this.maxVisible > 0) return this.maxVisible;
    return this.allItems.length > 2 ? 2 : this.allItems.length;
  }

  get visibleItems(): ContextRailItem[] {
    return this.allItems.slice(0, this.effectiveMaxVisible);
  }

  get overflowCount(): number {
    return Math.max(0, this.allItems.length - this.effectiveMaxVisible);
  }

  get fileCount(): number {
    return this.allItems.filter(i => i.type === 'file').length;
  }

  get dbCount(): number {
    return this.allItems.filter(i => i.type === 'database').length;
  }

  get hasSummary(): boolean {
    return this.allItems.length > 0 || !!this.attachedDatagrid;
  }

  // ── Popover control ─────────────────────────────────────────────────

  openPopover(event: Event): void {
    event.stopPropagation();
    this.popoverOpen = true;
  }

  closePopover(): void {
    this.popoverOpen = false;
  }

  onDatagridClick(): void {
    if (this.attachedDatagrid) {
      this.datagridClick.emit(this.attachedDatagrid.id);
    }
  }

  // ── Icon/colour helpers ─────────────────────────────────────────────

  private truncate(name: string, maxLen = 15): string {
    const base = name.replace(/\.(xlsx|csv|xls|json|pdf)/gi, '');
    return base.length > maxLen ? base.slice(0, maxLen - 1) + '…' : base;
  }

  private detectFileSubType(name: string): string {
    const lower = (name || '').toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.json')) return 'json';
    return 'file';
  }

  private detectDbSubType(type: string): string {
    const t = (type || '').toLowerCase();
    if (t.includes('postgres') || t.includes('pg_') || t.includes('supabase')) return 'postgres';
    if (t.includes('clickhouse') || t.includes('clk')) return 'clickhouse';
    if (t.includes('mysql') || t.includes('mariadb')) return 'mysql';
    if (t.includes('mongo')) return 'mongo';
    if (t.includes('redis')) return 'redis';
    if (t.includes('snowflake')) return 'snowflake';
    if (t.includes('bigquery')) return 'bigquery';
    return 'generic';
  }

  private fileIconInfo(sub: string): { iconClasses: string[]; iconColor: string; iconUrl: string | null } {
    switch (sub) {
      case 'xlsx': return { iconClasses: ['fa-regular', 'fa-file-excel'], iconColor: '#217346', iconUrl: null };
      case 'csv':  return { iconClasses: ['fa-solid', 'fa-file-csv'], iconColor: '#0891b2', iconUrl: null };
      case 'pdf':  return { iconClasses: ['fa-regular', 'fa-file-pdf'], iconColor: '#dc2626', iconUrl: null };
      case 'json': return { iconClasses: ['fa-solid', 'fa-file-code'], iconColor: '#f59e0b', iconUrl: null };
      default:     return { iconClasses: ['fa-solid', 'fa-file-lines'], iconColor: '#6366f1', iconUrl: null };
    }
  }

  private dbIconInfo(sub: string): { iconClasses: string[]; iconColor: string; iconUrl: string | null } {
    const iconBase = { iconClasses: ['fa-solid', 'fa-database'] };
    switch (sub) {
      case 'postgres':   return { ...iconBase, iconColor: '#336791', iconUrl: 'assets/postgres.svg' };
      case 'clickhouse': return { ...iconBase, iconColor: '#f5a623', iconUrl: 'assets/clickhouse.svg' };
      case 'mysql':      return { ...iconBase, iconColor: '#f29111', iconUrl: 'assets/mysql.svg' };
      case 'mongo':      return { ...iconBase, iconColor: '#4db33d', iconUrl: 'assets/mongodb.svg' };
      case 'redis':      return { ...iconBase, iconColor: '#dc382d', iconUrl: 'assets/redis.svg' };
      case 'snowflake':  return { ...iconBase, iconColor: '#29b5e8', iconUrl: 'assets/snowflake.svg' };
      case 'bigquery':   return { ...iconBase, iconColor: '#4285f4', iconUrl: 'assets/bigquery.svg' };
      default:           return { ...iconBase, iconColor: '#6366f1', iconUrl: null };
    }
  }
}
