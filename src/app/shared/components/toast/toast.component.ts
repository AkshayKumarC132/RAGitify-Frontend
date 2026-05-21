import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastService, ToastConfig } from '../../services/toast.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
    selector: 'app-toast',
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss'],
    animations: [
        trigger('toastAnimation', [
            transition(':enter', [
                style({ transform: 'translateX(100%)', opacity: 0 }),
                animate('300ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('250ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
            ])
        ])
    ]
})
export class ToastComponent implements OnInit, OnDestroy {
    toasts: ToastConfig[] = [];
    private sub = new Subscription();

    constructor(private toastService: ToastService, private router: Router) { }

    ngOnInit() {
        this.sub.add(this.toastService.toast$.subscribe(toast => {
            this.toasts.push(toast);
            setTimeout(() => this.remove(toast.id!), toast.duration);
        }));
    }

    ngOnDestroy() {
        this.sub.unsubscribe();
    }

    remove(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
    }

    onClick(toast: ToastConfig) {
        if (toast.threadId) {
            this.router.navigate(['/home/chat', toast.threadId]);
        }
        this.remove(toast.id!);
    }
}
