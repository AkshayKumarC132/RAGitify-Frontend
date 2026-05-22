import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
    private openState$ = new BehaviorSubject<boolean>(false);
    readonly isOpen$ = this.openState$.asObservable();

    open(): void { this.openState$.next(true); }
    close(): void { this.openState$.next(false); }
    toggle(): void { this.openState$.next(!this.openState$.value); }
    get isOpen(): boolean { return this.openState$.value; }
}
