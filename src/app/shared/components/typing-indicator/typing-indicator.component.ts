import { Component, Input, OnDestroy, OnInit } from '@angular/core';

@Component({
  selector: 'app-typing-indicator',
  template: `
    <div class="typing-row" role="status" aria-live="polite">
      <div class="typing-pill">
        <span class="typing-label">{{ displayLabel }}</span>
        <span class="typing-dots" aria-hidden="true">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
      </div>
    </div>
  `,
  styles: [`
    .typing-row {
      display: flex;
      width: 100%;
      padding: 0.35rem 0.25rem;
    }

    .typing-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.45rem 0.7rem;
      border-radius: 999px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.10);
      max-width: 100%;
    }

    .typing-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }

    .typing-dots {
      display: inline-flex;
      gap: 0.25rem;
      align-items: center;
      transform: translateY(1px);
    }

    .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-secondary);
      opacity: 0.55;
      animation: bubble 1.1s infinite ease-in-out;
    }

    .dot:nth-child(2) { animation-delay: 0.12s; }
    .dot:nth-child(3) { animation-delay: 0.24s; }

    @keyframes bubble {
      0%, 100% {
        transform: translateY(0);
        opacity: 0.45;
      }
      50% {
        transform: translateY(-3px);
        opacity: 1;
      }
    }
  `]
})
export class TypingIndicatorComponent implements OnInit, OnDestroy {
  /**
   * Activity label shown in the typing pill.
   * Examples: "Retrieving", "Generating", "Thinking", "Searching".
   */
  @Input() label: string | null = null;

  /**
   * If true, cycles through `statuses` in a loop while the component is visible.
   * This avoids hardcoding a single label like "Generating" everywhere.
   */
  @Input() cycle: boolean = true;

  /** List of statuses to loop through when `cycle=true` and `label` is not provided. */
  @Input() statuses: string[] = ['Retrieving', 'Searching', 'Thinking', 'Generating'];

  /** ms per status */
  @Input() cycleIntervalMs: number = 3000;

  protected displayLabel: string = 'Retrieving';
  private timer: any;
  private index = 0;

  ngOnInit(): void {
    this.displayLabel = this.resolveInitialLabel();
    if (this.shouldCycle()) {
      this.startCycling();
    }
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveInitialLabel(): string {
    if (this.label && this.label.trim().length) {
      return this.label.trim();
    }
    const list = (this.statuses || []).filter(s => !!s && !!s.trim());
    return list.length ? list[0].trim() : 'Generating';
  }

  private shouldCycle(): boolean {
    if (!this.cycle) return false;
    // If label is explicitly provided, do not auto-cycle unless user wants it
    if (this.label && this.label.trim().length) return false;
    const list = (this.statuses || []).filter(s => !!s && !!s.trim());
    return list.length > 1;
  }

  private startCycling(): void {
    const list = (this.statuses || []).filter(s => !!s && !!s.trim()).map(s => s.trim());
    if (list.length <= 1) return;
    this.index = 0;
    this.timer = setInterval(() => {
      this.index = (this.index + 1) % list.length;
      this.displayLabel = list[this.index];
    }, Math.max(400, this.cycleIntervalMs || 1200));
  }
}
