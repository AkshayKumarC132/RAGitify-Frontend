import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pure pipe that formats an ISO timestamp into a human-readable
 * relative label (e.g. "Today", "Yesterday", "3 days ago") or a
 * short date for older entries.
 *
 * Being a pure pipe, Angular only re-evaluates it when the input value
 * changes — unlike a component method called in the template which
 * re-executes on every change-detection cycle.
 */
@Pipe({
  name: 'formatTime',
  pure: true
})
export class FormatTimePipe implements PipeTransform {
  transform(timestamp: string | null | undefined): string {
    if (!timestamp) {
      return '';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDiff = Math.floor((today.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 60_000) {
      return 'Just now';
    }
    if (dayDiff === 0) {
      return 'Today';
    }
    if (dayDiff === 1) {
      return 'Yesterday';
    }
    if (dayDiff < 7) {
      return `${dayDiff} days ago`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
