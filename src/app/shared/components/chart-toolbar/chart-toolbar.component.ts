import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { ChartType } from '../../models/chart-config.model';

interface ChartTypeOption {
  type: ChartType;
  label: string;
  icon: string; // Font Awesome class
}

const CHART_TYPE_OPTIONS: ChartTypeOption[] = [
  { type: 'bar',      label: 'Bar',      icon: 'fa-solid fa-chart-bar' },
  { type: 'line',     label: 'Line',     icon: 'fa-solid fa-chart-line' },
  { type: 'pie',      label: 'Pie',      icon: 'fa-solid fa-chart-pie' },
  { type: 'doughnut', label: 'Doughnut', icon: 'fa-solid fa-circle-half-stroke' },
  { type: 'scatter',  label: 'Scatter',  icon: 'fa-solid fa-braille' },
  { type: 'radar',    label: 'Radar',    icon: 'fa-solid fa-star-of-life' },
];

/**
 * Chart override toolbar — shows type pills and collapsible axis controls.
 *
 * Emits pure events; the parent (MessageBubbleComponent) holds all state
 * and rebuilds the ChartConfig via ChartAutoPickService on each change.
 */
@Component({
  selector: 'app-chart-toolbar',
  templateUrl: './chart-toolbar.component.html',
  styleUrls: ['./chart-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartToolbarComponent {
  @Input() activeType!: ChartType;
  @Input() labelColumn!: string;
  @Input() dataColumns!: string[];
  @Input() availableLabelColumns: string[] = [];
  @Input() availableDataColumns: string[] = [];

  @Output() typeChange = new EventEmitter<ChartType>();
  @Output() labelColumnChange = new EventEmitter<string>();
  @Output() dataColumnsChange = new EventEmitter<string[]>();
  @Output() expandChart = new EventEmitter<void>();
  @Output() closeChart = new EventEmitter<void>();
  /** Fired whenever the axis config panel is opened or closed. */
  @Output() axisConfigToggled = new EventEmitter<void>();

  readonly chartTypes = CHART_TYPE_OPTIONS;
  showAxisConfig = false;

  toggleAxisConfig(): void {
    this.showAxisConfig = !this.showAxisConfig;
    this.axisConfigToggled.emit();
  }

  onLabelChange(event: Event): void {
    const sel = event.target as HTMLSelectElement;
    this.labelColumnChange.emit(sel.value);
  }

  onDataColumnToggle(col: string): void {
    const current = [...(this.dataColumns ?? [])];
    const idx = current.indexOf(col);
    if (idx >= 0) {
      // Don't allow deselecting the last column
      if (current.length === 1) return;
      current.splice(idx, 1);
    } else {
      current.push(col);
    }
    this.dataColumnsChange.emit(current);
  }

  isDataColSelected(col: string): boolean {
    return (this.dataColumns ?? []).includes(col);
  }
}
