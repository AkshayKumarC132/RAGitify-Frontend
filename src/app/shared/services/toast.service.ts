import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastVariant = 'thread' | 'success' | 'info' | 'warning' | 'error';

export interface ToastConfig {
    id?: string;
    title: string;
    message: string;
    threadId?: string;
    duration?: number;
    variant?: ToastVariant;
    icon?: string;
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
            duration: config.duration || 5000,
            variant: config.variant || (config.threadId ? 'thread' : 'info')
        });
    }

    success(title: string, message: string = '', duration?: number) {
        this.show({ title, message, variant: 'success', duration: duration ?? 3500 });
    }

    info(title: string, message: string = '', duration?: number) {
        this.show({ title, message, variant: 'info', duration: duration ?? 4000 });
    }

    warning(title: string, message: string = '', duration?: number) {
        this.show({ title, message, variant: 'warning', duration: duration ?? 5000 });
    }

    error(title: string, message: string = '', duration?: number) {
        this.show({ title, message, variant: 'error', duration: duration ?? 6000 });
    }
}
