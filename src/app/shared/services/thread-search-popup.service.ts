import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Thread } from '../models/thread.model';

@Injectable({
  providedIn: 'root'
})
export class ThreadSearchPopupService {
  private popupState$ = new BehaviorSubject<{ show: boolean; threads: Thread[]; currentThread: Thread | null }>({
    show: false,
    threads: [],
    currentThread: null
  });
  private threadSelected$ = new Subject<Thread>();

  getPopupState(): Observable<{ show: boolean; threads: Thread[]; currentThread: Thread | null }> {
    return this.popupState$.asObservable();
  }

  getThreadSelected(): Observable<Thread> {
    return this.threadSelected$.asObservable();
  }

  /**
   * Opens the search popup with the given threads
   */
  open(threads: Thread[], currentThread: Thread | null = null): void {
    this.popupState$.next({
      show: true,
      threads,
      currentThread
    });
  }

  /**
   * Closes the popup
   */
  close(): void {
    this.popupState$.next({
      show: false,
      threads: [],
      currentThread: null
    });
  }

  /**
   * Emits a thread selection event
   */
  selectThread(thread: Thread): void {
    this.threadSelected$.next(thread);
    this.close();
  }
}

