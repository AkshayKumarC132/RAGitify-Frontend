import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'card' | 'list-item' | 'doc-card';

@Component({
    selector: 'app-skeleton',
    templateUrl: './skeleton.component.html',
    styleUrls: ['./skeleton.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonComponent {
    @Input() variant: SkeletonVariant = 'text';
    @Input() count: number = 1;
    @Input() width: string = '100%';
    @Input() height: string = '';
    @Input() rounded: boolean = false;

    get items(): number[] {
        return Array.from({ length: Math.max(1, this.count) }, (_, i) => i);
    }
}
