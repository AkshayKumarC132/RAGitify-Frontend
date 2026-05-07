import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Message } from '../../models/message.model';
import { Run } from '../../models/run.model';
import { ConversationService } from '../../services/conversation.service';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-message-bubble',
    templateUrl: './message-bubble.component.html',
    styleUrls: ['./message-bubble.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBubbleComponent implements OnInit, OnDestroy, OnChanges {
    // Relaxed type to accept Message (number id) or generic object with compatible fields (e.g. ConversationMessage with string id)
    @Input() message!: any;
    @Input() isLast: boolean = false;
    @Input() canRerun: boolean = false;
    @Input() run: Run | undefined;
    @Input() rerunLoading: boolean = false;
    @Input() showPager: boolean = false;
    @Input() pageLabel: string = '';
    @Input() pagerHasPrev: boolean = false;
    @Input() pagerHasNext: boolean = false;
    @Input() showSources: boolean = true;
    @Input() isStreaming: boolean = false;
    @Input() conversationId?: string;
    @Input() enableDataGrid: boolean = false;
    @Output() rerun = new EventEmitter<void>();
    @Output() pagerPrev = new EventEmitter<void>();
    @Output() pagerNext = new EventEmitter<void>();

    displayContent: string = '';
    renderedContent: SafeHtml | null = null;
    copied = false;
    dataGridColumns: string[] = [];
    dataGridRows: Record<string, any>[] = [];

    // Data Grid Modal State
    showDataGridModal = false;
    dataGridLoading = false;
    modalDataGridColumns: string[] = [];
    modalDataGridRows: Record<string, any>[] = [];

    // Inline Data Grid State
    inlineDataGridColumns: string[] = [];
    inlineDataGridRows: Record<string, any>[] = [];
    private inlineDataLoaded = false;

    private copyResetTimeout?: ReturnType<typeof setTimeout>;
    private previousContent: string = '';
    private previousEnableDataGrid: boolean = false;

    constructor(
        private sanitizer: DomSanitizer,
        private conversationService: ConversationService,
        private cdr: ChangeDetectorRef
    ) { }

    get isFailedRun(): boolean {
        return !this.isUser && this.run?.status === 'failed';
    }

    get runErrorMessage(): string {
        const msg = this.run?.metadata?.['error_message'];
        return typeof msg === 'string' ? msg : '';
    }

    get showRunErrorInfo(): boolean {
        return this.isFailedRun && !!this.runErrorMessage;
    }

    ngOnInit() {
        this.previousContent = this.message?.content || '';
        this.previousEnableDataGrid = this.enableDataGrid;
        const safeContent = this.sanitizeContent(this.message.content);
        this.displayContent = safeContent;
        this.updateRenderedContent();
        this.extractDataGrid();
        this.checkInlineDataLoad();
    }

    ngOnChanges(changes: SimpleChanges): void {
        // Re-compute content when message object reference changes (streaming delta)
        // or when run status changes (e.g. in_progress → failed).
        if (changes['run'] || changes['message']) {
            this.previousContent = this.message?.content || '';
            const safeContent = this.sanitizeContent(this.message?.content || '');
            this.displayContent = safeContent;
            this.updateRenderedContent();
            this.extractDataGrid();
            this.checkInlineDataLoad();
        }

        if (changes['enableDataGrid']) {
            this.checkInlineDataLoad();
        }
    }

    private checkInlineDataLoad(): void {
        if (!this.enableDataGrid || !this.hasDataGrid || this.inlineDataLoaded) {
            return;
        }

        if (this.dataGridRows.length > 0) {
            this.inlineDataGridColumns = [...this.dataGridColumns];
            this.inlineDataGridRows = [...this.dataGridRows];
            this.inlineDataLoaded = true;
            return;
        }

        if (!this.conversationId || !this.message?.id || this.dataGridLoading) {
            return;
        }

        this.dataGridLoading = true;
        this.conversationService.getDataGrid(this.conversationId, this.message.id).subscribe({
            next: (res) => {
                if (res.data) {
                    const flatRows = this.flattenDataGrid(res.data);
                    if (flatRows.length > 0) {
                        this.inlineDataGridColumns = Object.keys(flatRows[0]);
                        this.inlineDataGridRows = flatRows;
                    }
                }
                this.dataGridLoading = false;
                this.inlineDataLoaded = true;
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error('[MessageBubble] Error loading inline data grid:', err);
                this.dataGridLoading = false;
                if (err.status !== 404) {
                    this.inlineDataLoaded = true;
                }
                this.cdr.markForCheck();
            }
        });
    }

    private sanitizeContent(content?: string): string {
        if (!content) {
            return content || '';
        }

        // Prefer run status over brittle text matching.
        // If the backend marks the run as failed, show a consistent error response.
        if (this.message?.role === 'assistant' && this.run?.status === 'failed') {
            return 'Oops!';
        }

        return content;
    }

    ngOnDestroy(): void {
        if (this.copyResetTimeout) {
            clearTimeout(this.copyResetTimeout);
        }
    }

    get isUser(): boolean {
        return this.message.role === 'user';
    }

    get isCancelledRun(): boolean {
        const hasEmptyContent = !this.message.content ||
            (typeof this.message.content === 'string' && this.message.content.trim() === '');
        return !this.isUser &&
            this.run?.status === 'cancelled' &&
            hasEmptyContent;
    }

    get showEmptyState(): boolean {
        return this.isCancelledRun;
    }

    get isHidden(): boolean {
        if (this.isUser) return false;
        const hasContent = !!this.displayContent && this.displayContent.trim().length > 0;
        if (hasContent) return false;
        if (this.showEmptyState) return false;
        if (this.showRunErrorInfo) return false;
        return true;
    }

    get attachedDocuments(): Array<{ id: string; name: string }> {
        const attachedDocuments = this.message?.metadata?.['attached_documents'];
        if (!Array.isArray(attachedDocuments)) {
            return [];
        }

        return attachedDocuments
            .map(document => ({
                id: String(document?.id || ''),
                name: String(document?.name || '').trim()
            }))
            .filter(document => !!document.id && !!document.name);
    }

    formatTime(timestamp: string): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    private updateRenderedContent(): void {
        if (this.isUser) {
            this.renderedContent = null;
            return;
        }

        const raw = this.displayContent || '';

        // Configure marked options
        marked.setOptions({
            breaks: true,
            gfm: true
        });
        const html = marked.parse(raw) as string;
        const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
        this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
    }

    private flattenDataGrid(grid: any): Record<string, any>[] {
        if (!grid || !Array.isArray(grid) || !grid.length) {
            return [];
        }

        const rows: Record<string, any>[] = [];
        // Check if it's already a flat array of objects
        if (grid.length > 0 && !Array.isArray(grid[0])) {
            rows.push(...grid);
        } else {
            // It's an array of chunks (arrays)
            for (const subArray of grid) {
                if (Array.isArray(subArray)) {
                    rows.push(...subArray);
                }
            }
        }
        return rows;
    }

    private extractDataGrid(): void {
        this.dataGridColumns = [];
        this.dataGridRows = [];

        const grid = this.message?.metadata?.['data_grid'];
        const rows = this.flattenDataGrid(grid);

        if (!rows.length) {
            return;
        }

        // Derive column headers from the keys of the first row
        this.dataGridColumns = Object.keys(rows[0]);
        this.dataGridRows = rows;
    }

    get hasDataGrid(): boolean {
        return !!this.message?.has_data_grid || !!this.message?.metadata?.['data_grid'];
    }

    get dataGridRecordCount(): number | string {
        if (this.message?.data_grid_row_count !== undefined) {
            return this.message.data_grid_row_count;
        }
        if (this.message?.metadata?.['row_count'] !== undefined) {
            return this.message.metadata['row_count'];
        }
        const grid = this.message?.metadata?.['data_grid'];
        if (grid && Array.isArray(grid)) {
            let count = 0;
            for (const sub of grid) {
                if (Array.isArray(sub)) count += sub.length;
                else count++;
            }
            return count;
        }
        return '';
    }

    previewDataGrid(downloadCsvAfter: boolean = false): void {
        console.log('[MessageBubble] previewDataGrid called. Has dataGridRows?', this.dataGridRows.length > 0);

        if (this.dataGridRows.length > 0) {
            // Already extracted from ephemeral metadata
            this.modalDataGridColumns = this.dataGridColumns;
            this.modalDataGridRows = this.dataGridRows;

            if (downloadCsvAfter) {
                this.exportCsv();
            } else {
                this.showDataGridModal = true;
            }
            return;
        }

        if (!this.conversationId || !this.message?.id) {
            console.error('[MessageBubble] Cannot preview data grid: missing conversationId or message.id');
            alert('Cannot preview data grid: Conversation ID or Message ID is missing.');
            return;
        }

        if (!downloadCsvAfter) {
            this.showDataGridModal = true;
            this.dataGridLoading = true;
        }

        this.modalDataGridColumns = [];
        this.modalDataGridRows = [];

        this.conversationService.getDataGrid(this.conversationId, this.message.id).subscribe({
            next: (res) => {
                if (res.data) {
                    const flatRows = this.flattenDataGrid(res.data);
                    if (flatRows.length > 0) {
                        this.modalDataGridColumns = Object.keys(flatRows[0]);
                        this.modalDataGridRows = flatRows;
                    }
                }
                this.dataGridLoading = false;
                this.cdr.markForCheck();

                if (downloadCsvAfter) {
                    setTimeout(() => this.exportCsv(), 100);
                }
            },
            error: (err) => {
                console.error('[MessageBubble] Error loading data grid:', err);
                this.dataGridLoading = false;
                this.cdr.markForCheck();
                if (err.status === 404) {
                    alert('Data grid not found. It might be a temporary message or streaming is incomplete.');
                }
            }
        });
    }

    closeDataGridModal(): void {
        this.showDataGridModal = false;
    }

    formatColumnHeader(key: string): string {
        return key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    async copyMessage(): Promise<void> {
        const textToCopy = this.displayContent || this.message.content || '';

        if (!textToCopy) {
            return;
        }

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                this.fallbackCopy(textToCopy);
            }
            this.showCopiedFeedback();
        } catch (error) {
            console.error('Failed to copy message', error);
            this.fallbackCopy(textToCopy);
            this.showCopiedFeedback();
        }
    }

    private fallbackCopy(text: string): void {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    private showCopiedFeedback(): void {
        this.copied = true;
        if (this.copyResetTimeout) {
            clearTimeout(this.copyResetTimeout);
        }
        this.copyResetTimeout = setTimeout(() => {
            this.copied = false;
            this.cdr.markForCheck();
        }, 2000);
    }

    exportCsv(): void {
        const rowsToExport = this.modalDataGridRows.length > 0
            ? this.modalDataGridRows
            : this.inlineDataGridRows.length > 0
                ? this.inlineDataGridRows
                : this.dataGridRows;
        if (!rowsToExport || rowsToExport.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
        const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

        const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `data_export_${new Date().getTime()}.csv`;
        link.click();

        URL.revokeObjectURL(link.href);
    }

    onRerunClick(): void {
        if (this.rerunLoading) {
            return;
        }
        this.rerun.emit();
    }

    onPagerPrev(): void {
        if (this.pagerHasPrev) {
            this.pagerPrev.emit();
        }
    }

    onPagerNext(): void {
        if (this.pagerHasNext) {
            this.pagerNext.emit();
        }
    }

    getDocumentIds(message: any): string[] {
        if (!message.metadata || !message.metadata['used_document_ids']) {
            return [];
        }
        return Array.isArray(message.metadata['used_document_ids'])
            ? message.metadata['used_document_ids']
            : [];
    }
}
