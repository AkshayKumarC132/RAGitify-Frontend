import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { LoadingService } from '../../services/loading.service';

@Component({
    selector: 'app-top-progress',
    templateUrl: './top-progress.component.html',
    styleUrls: ['./top-progress.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopProgressComponent implements OnInit, OnDestroy {
    visible = false;
    private sub?: Subscription;
    private hideTimer: any = null;
    private showTimer: any = null;

    constructor(private loading: LoadingService, private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.sub = this.loading.loading$.subscribe(isLoading => {
            if (isLoading) {
                // Defer the show by 80ms so very fast requests don't flash the bar.
                if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
                if (!this.visible && !this.showTimer) {
                    this.showTimer = setTimeout(() => {
                        this.visible = true;
                        this.showTimer = null;
                        this.cdr.markForCheck();
                    }, 80);
                }
            } else {
                if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
                if (this.visible) {
                    // Let the bar complete its sweep visually before hiding.
                    this.hideTimer = setTimeout(() => {
                        this.visible = false;
                        this.hideTimer = null;
                        this.cdr.markForCheck();
                    }, 220);
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
        if (this.hideTimer) clearTimeout(this.hideTimer);
        if (this.showTimer) clearTimeout(this.showTimer);
    }
}
