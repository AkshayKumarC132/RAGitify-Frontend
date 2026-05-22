import { Directive, ElementRef, HostListener, Input, OnDestroy, Renderer2 } from '@angular/core';
import { Subscription } from 'rxjs';
import { DocumentService } from '../services/document.service';
import { DocumentPreview } from '../models/document.model';

/**
 * Lightweight hover preview for document references. Attach to a chip / pill via:
 *   <span [appDocPreview]="doc.id">Doc</span>
 *
 * On hover (after a 350ms intent delay) we fetch /document/<id>/preview/ and render a
 * floating popover next to the trigger. Results are cached per documentId on the
 * directive instance — subsequent hovers reuse the same fetch.
 */
@Directive({
    selector: '[appDocPreview]'
})
export class DocPreviewDirective implements OnDestroy {
    @Input('appDocPreview') documentId: string = '';
    /** Optional fallback display name to render before preview loads */
    @Input() docPreviewTitle: string = '';

    private static cache = new Map<string, DocumentPreview>();
    private static readonly OPEN_DELAY = 350;
    private static readonly CLOSE_DELAY = 120;

    private popoverEl: HTMLDivElement | null = null;
    private openTimer: any = null;
    private closeTimer: any = null;
    private fetchSub?: Subscription;

    constructor(
        private host: ElementRef<HTMLElement>,
        private renderer: Renderer2,
        private docService: DocumentService
    ) {}

    @HostListener('mouseenter')
    onEnter(): void {
        if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
        if (this.openTimer || this.popoverEl) return;
        this.openTimer = setTimeout(() => {
            this.openTimer = null;
            this.openPopover();
        }, DocPreviewDirective.OPEN_DELAY);
    }

    @HostListener('mouseleave')
    onLeave(): void {
        if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
        if (!this.popoverEl) return;
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null;
            this.closePopover();
        }, DocPreviewDirective.CLOSE_DELAY);
    }

    @HostListener('focus')
    onFocus(): void { this.onEnter(); }

    @HostListener('blur')
    onBlur(): void { this.onLeave(); }

    ngOnDestroy(): void {
        if (this.openTimer) clearTimeout(this.openTimer);
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.fetchSub?.unsubscribe();
        this.closePopover();
    }

    private openPopover(): void {
        if (!this.documentId) return;

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

        const cached = DocPreviewDirective.cache.get(this.documentId);
        if (cached) {
            this.renderPopover(cached);
        } else {
            this.renderLoading();
            this.fetchSub = this.docService.getPreview(this.documentId).subscribe({
                next: (preview) => {
                    DocPreviewDirective.cache.set(this.documentId, preview);
                    if (this.popoverEl) this.renderPopover(preview);
                },
                error: () => {
                    if (this.popoverEl) this.renderError();
                }
            });
        }

        // Defer positioning until the popover has measurable dimensions.
        requestAnimationFrame(() => this.positionPopover());
    }

    private closePopover(): void {
        if (!this.popoverEl) return;
        this.fetchSub?.unsubscribe();
        this.fetchSub = undefined;
        try {
            this.renderer.removeChild(document.body, this.popoverEl);
        } catch {
            // Element may have already been detached if Angular cleared it.
        }
        this.popoverEl = null;
    }

    private renderLoading(): void {
        if (!this.popoverEl) return;
        const title = this.docPreviewTitle || 'Loading…';
        this.popoverEl.innerHTML = `
            <div class="doc-preview-title">${this.escape(title)}</div>
            <div class="doc-preview-loading">
                <span class="doc-preview-spinner" aria-hidden="true"></span>
                Loading preview…
            </div>`;
    }

    private renderError(): void {
        if (!this.popoverEl) return;
        this.popoverEl.innerHTML = `
            <div class="doc-preview-title">${this.escape(this.docPreviewTitle || 'Preview unavailable')}</div>
            <div class="doc-preview-error">We couldn't load the preview.</div>`;
    }

    private renderPopover(p: DocumentPreview): void {
        if (!this.popoverEl) return;
        const meta: string[] = [];
        if (p.file_type) meta.push(p.file_type.toUpperCase());
        if (p.file_size) meta.push(this.formatSize(p.file_size));
        if (p.uploaded_at) meta.push(this.formatDate(p.uploaded_at));

        const keywordsHtml = (p.keywords || []).length
            ? `<div class="doc-preview-tags">${p.keywords
                .slice(0, 6)
                .map(k => `<span class="doc-preview-tag">${this.escape(k)}</span>`)
                .join('')}</div>`
            : '';

        const snippetHtml = p.snippet
            ? `<div class="doc-preview-snippet">${this.escape(p.snippet)}</div>`
            : '<div class="doc-preview-empty">No summary available yet.</div>';

        this.popoverEl.innerHTML = `
            <div class="doc-preview-title">${this.escape(p.title)}</div>
            ${meta.length ? `<div class="doc-preview-meta">${meta.join(' · ')}</div>` : ''}
            ${snippetHtml}
            ${keywordsHtml}`;
        // Reposition once content has settled.
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

    private formatSize(bytes: number): string {
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let idx = 0;
        while (value >= 1024 && idx < units.length - 1) {
            value /= 1024;
            idx++;
        }
        return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
    }

    private formatDate(iso: string): string {
        try {
            return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return '';
        }
    }

    private escape(value: string): string {
        return (value || '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        } as Record<string, string>)[ch] || ch);
    }
}
