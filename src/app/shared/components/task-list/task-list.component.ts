import {
  Component,
  Input,
  OnChanges,
  OnInit,
  OnDestroy,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { TaskItem } from '../../models/response.model';

@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
  // Default change detection: ensures rapid-fire task_update stream events
  // all trigger re-renders instead of being coalesced by OnPush.
})
export class TaskListComponent implements OnChanges, OnInit, OnDestroy {
  /** The full list of pipeline tasks, updated in real time. */
  @Input() tasks: TaskItem[] = [];

  /** Whether the task list panel is visible (true during streaming). */
  @Input() visible: boolean = false;

  /** Visible tasks — excludes 'removed' items. */
  visibleTasks: TaskItem[] = [];

  /** Controls whether the detailed tree view is shown. */
  isExpanded: boolean = false;

  /** Dynamic fallback label for when activeTask has no label */
  fallbackStates: string[] = ['Analyzing...', 'Understanding...', 'Thinking...', 'Researching...', 'Searching...'];
  dynamicFallbackLabel: string = this.fallbackStates[0];
  private _fallbackInterval: any;
  private _fallbackIndex: number = 0;

  /** Timers for calculating task durations on the frontend. */
  taskTimers: Record<string, { start?: number; duration?: number }> = {};

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (this.visible) {
      this.startFallbackTimer();
    }
  }

  ngOnDestroy(): void {
    this.clearFallbackTimer();
  }

  private startFallbackTimer(): void {
    this.clearFallbackTimer();
    this._fallbackInterval = setInterval(() => {
      this._fallbackIndex = (this._fallbackIndex + 1) % this.fallbackStates.length;
      this.dynamicFallbackLabel = this.fallbackStates[this._fallbackIndex];
      this.cdr.markForCheck();
    }, 2000);
  }

  private clearFallbackTimer(): void {
    if (this._fallbackInterval) {
      clearInterval(this._fallbackInterval);
      this._fallbackInterval = null;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (changes['visible'].currentValue === true) {
        if (changes['visible'].previousValue !== true) {
          this.taskTimers = {};
          this.startFallbackTimer();
        }
      } else {
        this.clearFallbackTimer();
      }
    }

    if (changes['tasks'] || changes['visible']) {
      this.visibleTasks = (this.tasks || []).filter(t => t.status !== 'removed');

      // Calculate durations
      const now = Date.now();
      this.visibleTasks.forEach(t => {
        if (!this.taskTimers[t.id]) {
          this.taskTimers[t.id] = {};
        }
        const timer = this.taskTimers[t.id];

        if (t.status === 'in_progress' && !timer.start) {
          timer.start = now;
        } else if (t.status === 'completed' && timer.start && timer.duration === undefined) {
          timer.duration = (now - timer.start) / 1000;
        }
      });
    }
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  get activeTask(): TaskItem | undefined {
    // Return the currently in-progress task, or if none, the first pending one.
    // Do not fall back to a completed task, because if the stream is still visible,
    // the overall process is still running and we should show a 'Working...' spinner.
    let active = this.visibleTasks.find(t => t.status === 'in_progress');
    if (!active) {
       active = this.visibleTasks.find(t => t.status === 'pending');
    }
    return active;
  }

  get progressText(): string {
    if (!this.visibleTasks.length) return '';
    const active = this.activeTask;
    if (!active) return '';
    const idx = this.visibleTasks.findIndex(t => t.id === active.id);
    return `${idx + 1}/${this.visibleTasks.length}`;
  }

  getDuration(taskId: string): number | undefined {
    return this.taskTimers[taskId]?.duration;
  }

  /** Track by task id for efficient DOM updates. */
  trackById(_index: number, task: TaskItem): string {
    return task.id;
  }

  /** Returns true if any task is currently in progress. */
  get hasActiveTask(): boolean {
    return this.visibleTasks.some(t => t.status === 'in_progress');
  }
}
