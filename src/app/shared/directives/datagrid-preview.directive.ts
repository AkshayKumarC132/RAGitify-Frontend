import { Directive, ElementRef, HostListener, Input, OnDestroy, Renderer2 } from '@angular/core';

export interface AttachedDataGridPreview {
    id: number;
    name: string;
    row_count?: number;
    columns?: string[];
}

/**
 * Lightweight hover preview for datagrid references. Attach to a chip / pill via:
 *   <div [appDatagridPreview]="attachedDataGrid">...</div>
 *
 * On hover (after a 350ms intent delay) we render a floating popover next to the trigger
 * containing the datagrid details.
 */
@Directive({
    selector: '[appDatagridPreview]'
})
export class DatagridPreviewDirective implements OnDestroy {
    @Input('appDatagridPreview') datagrid: AttachedDataGridPreview | null = null;

    private static readonly OPEN_DELAY = 350;
    private static readonly CLOSE_DELAY = 120;

    private popoverEl: HTMLDivElement | null = null;
    private openTimer: any = null;
    private closeTimer: any = null;

    constructor(
        private host: ElementRef<HTMLElement>,
        private renderer: Renderer2
    ) {}

    @HostListener('mouseenter')
    onEnter(): void {
        if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
        if (this.openTimer || this.popoverEl) return;
        this.openTimer = setTimeout(() => {
            this.openTimer = null;
            this.openPopover();
        }, DatagridPreviewDirective.OPEN_DELAY);
    }

    @HostListener('mouseleave')
    onLeave(): void {
        if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
        if (!this.popoverEl) return;
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null;
            this.closePopover();
        }, DatagridPreviewDirective.CLOSE_DELAY);
    }

    @HostListener('focus')
    onFocus(): void { this.onEnter(); }

    @HostListener('blur')
    onBlur(): void { this.onLeave(); }

    ngOnDestroy(): void {
        if (this.openTimer) clearTimeout(this.openTimer);
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.closePopover();
    }

    private openPopover(): void {
        if (!this.datagrid) return;

        const popover = this.renderer.createElement('div') as HTMLDivElement;
        this.renderer.addClass(popover, 'doc-preview-popover');
        this.renderer.setAttribute(popover, 'role', 'tooltip');
        // Keep it from disappearing when the cursor enters the popover itself.
        popover.addEventListener('mouseenter', () => {
            if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
        });
        popover.addEventListener('mouseleave', () => this.onLeave());

        this.popoverEl = popover;
        this.renderer.appendChild(document.body, popover);
        
        this.renderPopover(this.datagrid);
    }

    private closePopover(): void {
        if (!this.popoverEl) return;
        try {
            this.renderer.removeChild(document.body, this.popoverEl);
        } catch {
            // Element may have already been detached if Angular cleared it.
        }
        this.popoverEl = null;
    }

    private formatNumber(num: number): string {
        return new Intl.NumberFormat().format(num);
    }

    private renderPopover(dg: AttachedDataGridPreview): void {
        if (!this.popoverEl) return;
        
        const meta: string[] = [`DATAGRID #${dg.id}`];
        if (dg.row_count !== undefined) meta.push(`${this.formatNumber(dg.row_count)} rows`);
        if (dg.columns?.length) meta.push(`${this.formatNumber(dg.columns.length)} columns`);

        const keywordsHtml = (dg.columns || []).length
            ? `<div class="doc-preview-tags">${dg.columns!
                .map(k => `<span class="doc-preview-tag">${this.escape(k)}</span>`)
                .join('')}</div>`
            : '';

        const snippetHtml = `<div class="doc-preview-snippet">The attached datagrid <b>${this.escape(dg.name)}</b> contains tabular data with ${dg.row_count !== undefined ? `<b>${this.formatNumber(dg.row_count)}</b> rows` : 'an unknown number of rows'}${dg.columns?.length ? ` and <b>${this.formatNumber(dg.columns.length)}</b> columns` : ''}.</div>`;

        this.popoverEl.innerHTML = `
            <div class="doc-preview-title">${this.escape(dg.name)}</div>
            ${meta.length ? `<div class="doc-preview-meta">${meta.join(' &middot; ')}</div>` : ''}
            ${snippetHtml}
            ${keywordsHtml}`;
            
        // Defer positioning until the popover has measurable dimensions.
        requestAnimationFrame(() => this.positionPopover());
    }

    private positionPopover(): void {
        if (!this.popoverEl) return;
        const hostRect = this.host.nativeElement.getBoundingClientRect();
        const popoverRect = this.popoverEl.getBoundingClientRect();
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const gap = 8;

        // Prefer above the host; fall back to below if not enough room.
        let top = hostRect.top - popoverRect.height - gap;
        if (top < 8) top = hostRect.bottom + gap;
        if (top + popoverRect.height > vpH - 8) {
            top = Math.max(8, vpH - popoverRect.height - 8);
        }

        // Center horizontally on host but clamp to viewport.
        let left = hostRect.left + hostRect.width / 2 - popoverRect.width / 2;
        left = Math.max(8, Math.min(left, vpW - popoverRect.width - 8));

        this.renderer.setStyle(this.popoverEl, 'top', `${top + window.scrollY}px`);
        this.renderer.setStyle(this.popoverEl, 'left', `${left + window.scrollX}px`);
    }

    private escape(value: string): string {
        return (value || '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        } as Record<string, string>)[ch] || ch);
    }
}
