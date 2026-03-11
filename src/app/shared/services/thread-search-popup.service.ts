import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Conversation } from '../models/conversation.model';

@Injectable({
  providedIn: 'root'
})
export class ThreadSearchPopupService {
  private popupState$ = new BehaviorSubject<{ show: boolean; threads: Conversation[]; currentThread: Conversation | null }>({
    show: false,
    threads: [],
    currentThread: null
  });
  private threadSelected$ = new Subject<Conversation>();

  getPopupState(): Observable<{ show: boolean; threads: Conversation[]; currentThread: Conversation | null }> {
    return this.popupState$.asObservable();
  }

  getThreadSelected(): Observable<Conversation> {
    return this.threadSelected$.asObservable();
  }

  /**
   * Opens the search popup with the given threads
   */
  open(threads: Conversation[], currentThread: Conversation | null = null): void {
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
  selectThread(thread: Conversation): void {
    this.threadSelected$.next(thread);
    this.close();
  }
}
