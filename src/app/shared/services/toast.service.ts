import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ToastConfig {
    id?: string;
    title: string;
    message: string;
    threadId?: string;
    duration?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toastSubject = new Subject<ToastConfig>();
    toast$ = this.toastSubject.asObservable();

    show(config: ToastConfig) {
        this.toastSubject.next({
            ...config,
            id: Math.random().toString(36).substring(2, 11),
            duration: config.duration || 5000
        });
    }
}
