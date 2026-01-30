import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = 0;
  private loadingSubject = new BehaviorSubject<boolean>(false);

  // Optional richer UI state for the global loader card
  private labelSubject = new BehaviorSubject<string>('Loading');

  get loading$(): Observable<boolean> {
    return this.loadingSubject.asObservable();
  }

  get label$(): Observable<string> {
    return this.labelSubject.asObservable();
  }

  /**
   * Optionally set a contextual label for the global loader.
   * Example: "Authenticating", "Syncing", "Fetching Workspace".
   */
  setLabel(label: string): void {
    this.labelSubject.next(label || 'Loading');
  }

  show(): void {
    this.activeRequests += 1;
    if (this.activeRequests === 1) {
      this.loadingSubject.next(true);
    }
  }

  hide(): void {
    if (this.activeRequests > 0) {
      this.activeRequests -= 1;
    }
    if (this.activeRequests === 0) {
      this.loadingSubject.next(false);
      // Reset to a neutral label for the next session.
      this.labelSubject.next('Loading');
    }
  }
}
