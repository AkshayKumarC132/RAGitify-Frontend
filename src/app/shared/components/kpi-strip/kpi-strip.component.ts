import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { KpiItem } from '../../models/conversation.model';

/** Accent colours cycling through the cards */
const ACCENT_COLORS = [
  { bg: 'rgba(99,102,241,0.10)', icon: 'rgba(99,102,241,0.85)',  border: 'rgba(99,102,241,0.20)' },
  { bg: 'rgba(16,185,129,0.10)', icon: 'rgba(16,185,129,0.85)',  border: 'rgba(16,185,129,0.20)' },
  { bg: 'rgba(245,158,11,0.10)', icon: 'rgba(245,158,11,0.85)',  border: 'rgba(245,158,11,0.20)' },
  { bg: 'rgba(239,68,68,0.10)',  icon: 'rgba(239,68,68,0.85)',   border: 'rgba(239,68,68,0.20)'  },
  { bg: 'rgba(59,130,246,0.10)', icon: 'rgba(59,130,246,0.85)',  border: 'rgba(59,130,246,0.20)' },
];

const ICON_CLASSES: Record<string, string> = {
  // Revenue / Money
  revenue:    'fa-solid fa-sack-dollar',
  sales:      'fa-solid fa-sack-dollar',
  income:     'fa-solid fa-sack-dollar',
  profit:     'fa-solid fa-chart-line',
  // Orders / Count
  orders:     'fa-solid fa-bag-shopping',
  orders_count: 'fa-solid fa-bag-shopping',
  count:      'fa-solid fa-hashtag',
  total:      'fa-solid fa-sigma',
  // Average
  average:    'fa-solid fa-chart-bar',
  avg:        'fa-solid fa-chart-bar',
  mean:       'fa-solid fa-chart-bar',
  // Category / Name
  category:   'fa-solid fa-tag',
  product:    'fa-solid fa-box',
  region:     'fa-solid fa-globe',
  top:        'fa-solid fa-trophy',
  best:       'fa-solid fa-trophy',
  // Default
  default:    'fa-solid fa-chart-simple',
};

@Component({
  selector: 'app-kpi-strip',
  templateUrl: './kpi-strip.component.html',
  styleUrls: ['./kpi-strip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiStripComponent implements OnChanges {
  @Input() kpis: KpiItem[] = [];

  /** Processed display-ready cards. */
  cards: {
    label: string;
    displayValue: string;
    rawValue: any;
    isNumeric: boolean;
    accent: (typeof ACCENT_COLORS)[0];
    iconClass: string;
  }[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kpis']) {
      this.cards = (this.kpis || []).slice(0, 5).map((kpi, i) => {
        const isNumeric = this._isNumeric(kpi.value);
        return {
          label: kpi.label,
          displayValue: this._format(kpi.value),
          rawValue: kpi.value,
          isNumeric,
          accent: ACCENT_COLORS[i % ACCENT_COLORS.length],
          iconClass: this._pickIcon(kpi.label),
        };
      });
    }
  }

  private _isNumeric(val: any): boolean {
    if (val === null || val === undefined || val === '') return false;
    return !isNaN(Number(val));
  }

  private _format(val: any): string {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    if (!isNaN(n)) {
      if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
      if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (Math.abs(n) >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      // Show up to 2 decimal places for small floats, none for integers
      return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
    }
    const s = String(val);
    return s.length > 30 ? s.slice(0, 28) + '…' : s;
  }

  private _pickIcon(label: string): string {
    const lower = label.toLowerCase();
    for (const key of Object.keys(ICON_CLASSES)) {
      if (key !== 'default' && lower.includes(key)) {
        return ICON_CLASSES[key];
      }
    }
    return ICON_CLASSES['default'];
  }
}
