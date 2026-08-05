import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { ContextRailItem } from '../context-rail/context-rail.component';

type FilterTab = 'all' | 'file' | 'database';

@Component({
  selector: 'app-context-popover',
  templateUrl: './context-popover.component.html',
  styleUrls: ['./context-popover.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextPopoverComponent implements OnChanges {
  @Input() items: ContextRailItem[] = [];
  @Input() open = false;

  @Output() closePopover = new EventEmitter<void>();

  searchQuery = '';
  activeFilter: FilterTab = 'all';

  constructor(private cdr: ChangeDetectorRef, private el: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      // Reset state when re-opened
      this.searchQuery = '';
      this.activeFilter = 'all';
    }
  }

  // ── Filter tabs ─────────────────────────────────────────────────────

  get fileCount(): number {
    return this.items.filter(i => i.type === 'file').length;
  }

  get dbCount(): number {
    return this.items.filter(i => i.type === 'database').length;
  }

  get filteredItems(): ContextRailItem[] {
    let result = this.items;

    if (this.activeFilter !== 'all') {
      result = result.filter(i => i.type === this.activeFilter);
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) || (i.subType || '').toLowerCase().includes(q)
      );
    }

    return result;
  }

  setFilter(tab: FilterTab): void {
    this.activeFilter = tab;
    this.cdr.markForCheck();
  }

  onSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  close(): void {
    this.closePopover.emit();
  }

  /** Close on Escape key */
  @HostListener('keydown.escape')
  onEscape(): void {
    this.close();
  }

  /** Click-outside handled by document:click */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.close();
    }
  }
}
