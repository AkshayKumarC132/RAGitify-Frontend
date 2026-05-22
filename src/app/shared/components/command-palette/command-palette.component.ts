import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CommandPaletteService } from '../../services/command-palette.service';
import { ConversationService } from '../../services/conversation.service';
import { DocumentService } from '../../services/document.service';
import { VectorStoreService } from '../../services/vector-store.service';
import { AssistantService } from '../../services/assistant.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

export interface PaletteItem {
    id: string;
    kind: 'thread' | 'document' | 'library' | 'assistant' | 'action';
    label: string;
    sublabel?: string;
    icon: string;
    keywords?: string;
    run: () => void;
}

@Component({
    selector: 'app-command-palette',
    templateUrl: './command-palette.component.html',
    styleUrls: ['./command-palette.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
    @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

    isOpen = false;
    query = '';
    activeIndex = 0;
    loadingItems = false;
    private allItems: PaletteItem[] = [];
    filteredItems: PaletteItem[] = [];
    private destroy$ = new Subject<void>();
    private querySubject = new Subject<string>();
    private dataLoaded = false;

    constructor(
        private palette: CommandPaletteService,
        private router: Router,
        private auth: AuthService,
        private threads: ConversationService,
        private docs: DocumentService,
        private stores: VectorStoreService,
        private assistants: AssistantService,
        private themeService: ThemeService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this.palette.isOpen$.pipe(takeUntil(this.destroy$)).subscribe(open => {
            this.isOpen = open;
            if (open) {
                this.query = '';
                this.activeIndex = 0;
                if (!this.dataLoaded) {
                    this.loadData();
                } else {
                    this.applyFilter('');
                }
                // Focus the input after Angular renders it.
                requestAnimationFrame(() => this.searchInput?.nativeElement.focus());
            }
            this.cdr.markForCheck();
        });

        this.querySubject.pipe(
            takeUntil(this.destroy$),
            debounceTime(60),
            distinctUntilChanged()
        ).subscribe(q => {
            this.applyFilter(q);
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    @HostListener('document:keydown', ['$event'])
    handleHotkey(event: KeyboardEvent): void {
        const cmdK = (event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K');
        if (cmdK) {
            event.preventDefault();
            this.palette.toggle();
            return;
        }
        if (!this.isOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.palette.close();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.activeIndex = Math.min(this.activeIndex + 1, this.filteredItems.length - 1);
            this.cdr.markForCheck();
            this.scrollActiveIntoView();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.activeIndex = Math.max(this.activeIndex - 1, 0);
            this.cdr.markForCheck();
            this.scrollActiveIntoView();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            this.runActive();
        }
    }

    onBackdrop(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.palette.close();
        }
    }

    onQueryChange(value: string): void {
        this.query = value;
        this.activeIndex = 0;
        this.querySubject.next(value);
    }

    selectItem(item: PaletteItem): void {
        try {
            item.run();
        } finally {
            this.palette.close();
        }
    }

    trackById(_: number, item: PaletteItem): string {
        return `${item.kind}:${item.id}`;
    }

    private runActive(): void {
        const item = this.filteredItems[this.activeIndex];
        if (item) this.selectItem(item);
    }

    private scrollActiveIntoView(): void {
        requestAnimationFrame(() => {
            const el = document.querySelector('.cp-results .cp-item.active');
            if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
        });
    }

    private loadData(): void {
        if (!this.auth.getToken()) {
            this.allItems = this.actionItems();
            this.applyFilter('');
            this.dataLoaded = true;
            this.cdr.markForCheck();
            return;
        }

        this.loadingItems = true;
        this.cdr.markForCheck();

        forkJoin({
            threads: this.threads.list().pipe(catchError(() => of([]))),
            docs: this.docs.list().pipe(catchError(() => of([]))),
            stores: this.stores.list().pipe(catchError(() => of([]))),
            assistants: this.assistants.list().pipe(catchError(() => of([])))
        }).subscribe(({ threads, docs, stores, assistants }) => {
            const items: PaletteItem[] = [];

            for (const thread of threads.slice(0, 50)) {
                items.push({
                    id: String(thread.id),
                    kind: 'thread',
                    label: thread.title || 'Untitled thread',
                    sublabel: thread.updated_at ? new Date(thread.updated_at).toLocaleString() : '',
                    icon: 'fa-message',
                    keywords: thread.title || '',
                    run: () => this.router.navigate(['/home/chat', thread.id])
                });
            }

            for (const store of stores) {
                items.push({
                    id: String(store.id),
                    kind: 'library',
                    label: store.name || 'Unnamed library',
                    sublabel: 'Library',
                    icon: 'fa-folder',
                    keywords: store.name || '',
                    run: () => this.router.navigate(['/workspace/knowledge'], { queryParams: { storeId: store.id } })
                });
            }

            for (const doc of docs.slice(0, 80)) {
                items.push({
                    id: String(doc.id),
                    kind: 'document',
                    label: doc.title || doc.original_filename || 'Untitled document',
                    sublabel: doc.file_type ? doc.file_type.toUpperCase() : 'Document',
                    icon: 'fa-file-lines',
                    keywords: `${doc.title || ''} ${doc.original_filename || ''}`,
                    run: () => this.router.navigate(['/workspace/document', doc.id])
                });
            }

            for (const a of assistants) {
                items.push({
                    id: String(a.id),
                    kind: 'assistant',
                    label: a.name || 'Unnamed assistant',
                    sublabel: a.model || 'Assistant',
                    icon: 'fa-robot',
                    keywords: a.name || '',
                    run: () => this.router.navigate(['/workspace/assistants'])
                });
            }

            items.push(...this.actionItems());

            this.allItems = items;
            this.loadingItems = false;
            this.dataLoaded = true;
            this.applyFilter(this.query);
            this.cdr.markForCheck();
        });
    }

    private actionItems(): PaletteItem[] {
        return [
            {
                id: 'new-chat',
                kind: 'action',
                label: 'Start a new chat',
                sublabel: 'Action · Home',
                icon: 'fa-plus',
                keywords: 'new chat thread',
                run: () => this.router.navigate(['/home/chat/new'])
            },
            {
                id: 'workspace',
                kind: 'action',
                label: 'Open workspace',
                sublabel: 'Action · Navigation',
                icon: 'fa-briefcase',
                keywords: 'workspace open',
                run: () => this.router.navigate(['/workspace'])
            },
            {
                id: 'knowledge',
                kind: 'action',
                label: 'Open knowledge library',
                sublabel: 'Action · Navigation',
                icon: 'fa-folder-open',
                keywords: 'knowledge library documents',
                run: () => this.router.navigate(['/workspace/knowledge'])
            },
            {
                id: 'settings',
                kind: 'action',
                label: 'Open settings',
                sublabel: 'Action · Navigation',
                icon: 'fa-gear',
                keywords: 'settings preferences',
                run: () => this.router.navigate(['/settings'])
            },
            {
                id: 'theme-toggle',
                kind: 'action',
                label: 'Toggle dark / light theme',
                sublabel: 'Action · Theme',
                icon: 'fa-circle-half-stroke',
                keywords: 'theme dark light mode',
                run: () => this.themeService.toggleTheme()
            },
            {
                id: 'logout',
                kind: 'action',
                label: 'Log out',
                sublabel: 'Action · Account',
                icon: 'fa-right-from-bracket',
                keywords: 'logout signout sign out',
                run: () => {
                    const token = this.auth.getToken();
                    if (token) {
                        this.auth.logout(token).subscribe({
                            complete: () => this.router.navigate(['/auth/login']),
                            error: () => this.router.navigate(['/auth/login'])
                        });
                    } else {
                        this.router.navigate(['/auth/login']);
                    }
                }
            }
        ];
    }

    private applyFilter(query: string): void {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            // Limit to first 40 items when empty so the list stays scannable.
            this.filteredItems = this.allItems.slice(0, 40);
            this.activeIndex = 0;
            return;
        }

        const scored: { item: PaletteItem; score: number }[] = [];
        for (const item of this.allItems) {
            const haystack = `${item.label} ${item.sublabel || ''} ${item.keywords || ''}`.toLowerCase();
            const score = this.fuzzyScore(haystack, q);
            if (score > 0) scored.push({ item, score });
        }
        scored.sort((a, b) => b.score - a.score);
        this.filteredItems = scored.slice(0, 30).map(s => s.item);
        this.activeIndex = 0;
    }

    /** Crude fuzzy scorer: exact substring beats char-order match, char-order beats nothing. */
    private fuzzyScore(haystack: string, needle: string): number {
        if (!needle) return 0;
        if (haystack.includes(needle)) return 100 + needle.length;
        let hi = 0, score = 0;
        for (const ch of needle) {
            const found = haystack.indexOf(ch, hi);
            if (found === -1) return 0;
            // Reward consecutive matches.
            score += found === hi ? 3 : 1;
            hi = found + 1;
        }
        return score;
    }
}
