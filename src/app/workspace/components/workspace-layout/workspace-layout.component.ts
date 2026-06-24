import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../shared/services/auth.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { VectorStore } from '../../../shared/models/vector-store.model';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { CommandPaletteService } from '../../../shared/services/command-palette.service';

@Component({
  selector: 'app-workspace-layout',
  templateUrl: './workspace-layout.component.html',
  styleUrls: ['./workspace-layout.component.scss']
})
export class WorkspaceLayoutComponent implements OnInit, OnDestroy {
  activeSection: 'knowledge' | 'prompts' = 'knowledge';
  activeDocumentId: string | null = null;
  activeLibraryStatsId: string | null = null;
  sidebarCollapsed = false;
  hoveringExpandControl = false;
  private brandExpandInteraction = false;
  private toggleExpandInteraction = false;
  private destroy$ = new Subject<void>();

  layoutVectorStores: VectorStore[] = [];
  layoutSelectedStore: VectorStore | null = null;
  libraryDocCounts: Record<string, number> = {};
  totalDocumentsCount = 0;
  librarySearchQuery = '';
  showLibraryPicker = true;
  private currentLibraryId: string | null = null;
  private currentView: string | null = null;

  get libraryCount(): number {
    return this.layoutVectorStores.length;
  }

  get filteredVectorStores(): VectorStore[] {
    const q = this.librarySearchQuery.trim().toLowerCase();
    if (!q) return this.layoutVectorStores;
    return this.layoutVectorStores.filter(s => (s.name || '').toLowerCase().includes(q));
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private knowledgeContext: WorkspaceKnowledgeContextService,
    private route: ActivatedRoute,
    private vectorStoreService: VectorStoreService,
    private commandPalette: CommandPaletteService
  ) { }

  openCommandPalette(): void {
    this.commandPalette.open();
  }

  ngOnInit(): void {
    this.knowledgeContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.layoutVectorStores = state.vectorStores;
        this.layoutSelectedStore = state.selectedVectorStore;
        this.libraryDocCounts = state.documentCounts;
        this.totalDocumentsCount = state.totalDocuments;
      });

    this.route.paramMap.subscribe(params => {
      this.activeDocumentId = params.get('documentId');
      this.activeLibraryStatsId = params.get('libraryId');
      this.applyLayoutRouteState();
      this.ensureSidebarLibraries();
    });

    this.route.queryParamMap.subscribe(params => {
      this.currentLibraryId = params.get('libraryId');
      this.currentView = params.get('view');
      this.applyLayoutRouteState();
      this.ensureSidebarLibraries();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLayoutLibrarySelect(store: VectorStore): void {
    this.knowledgeContext.setSelectedStore(store);
    this.router.navigate(['/workspace'], { queryParams: { libraryId: store.id } });
  }

  getBreadcrumbLibraryName(name: string | null | undefined, maxLength = 20): string {
    const safeName = (name || '').trim();
    if (!safeName) {
      return 'Library';
    }
    if (safeName.length <= maxLength) {
      return safeName;
    }
    return `${safeName.slice(0, maxLength)}...`;
  }

  openUploadOrNewLibrary(action: 'upload' | 'library'): void {
    if (action === 'library' && this.activeLibraryStatsId) {
      this.router.navigate(['/workspace'], {
        queryParams: {
          libraryId: this.activeLibraryStatsId,
          openNewLibrary: '1'
        }
      });
      return;
    }

    if (action === 'upload') {
      this.knowledgeContext.openUploadPanel.next();
    } else {
      this.knowledgeContext.openNewLibraryPanel.next();
    }
  }

  onLayoutEditLibrary(store: VectorStore): void {
    if (this.activeLibraryStatsId) {
      this.knowledgeContext.editLibraryRequested.next(store);
      return;
    }
    this.knowledgeContext.editLibraryRequested.next(store);
  }

  onLayoutDeleteLibrary(store: VectorStore): void {
    if (this.activeLibraryStatsId) {
      this.knowledgeContext.deleteLibraryRequested.next(store);
      return;
    }
    this.knowledgeContext.deleteLibraryRequested.next(store);
  }

  onLayoutChatLibrary(store: VectorStore): void {
    if (this.activeLibraryStatsId) {
      this.knowledgeContext.chatLibraryRequested.next(store);
      return;
    }
    this.knowledgeContext.chatLibraryRequested.next(store);
  }

  onLayoutStatsLibrary(store: VectorStore): void {
    this.router.navigate(['/workspace/library', store.id, 'stats']);
  }

  goToNewChat(): void {
    this.router.navigate(['/home']);
  }

  goToWorkspace(): void {
    // When user is on Your Libraries (picker), stay on picker. When in Prompts, go to Your Libraries (picker).
    if (this.showLibraryPicker || this.activeSection === 'prompts') {
      this.router.navigate(['/workspace'], { queryParams: {} });
      return;
    }
    const libraryId = this.layoutSelectedStore?.id
      ?? this.currentLibraryId
      ?? this.activeLibraryStatsId
      ?? this.route.snapshot.queryParamMap.get('libraryId');
    this.router.navigate(['/workspace'], { queryParams: libraryId ? { libraryId } : {} });
  }

  goToPrompts(): void {
    this.router.navigate(['/workspace'], { queryParams: { view: 'prompts' } });
  }

  goToLibraryPicker(): void {
    this.router.navigate(['/workspace'], { queryParams: {} });
  }

  goToConnectors(): void {
    this.router.navigate(['/connectors']);
  }

  goToLibrariesTab(): void {
    this.router.navigate(['/workspace'], { queryParams: { tab: 'libraries' } });
  }

  goToCurrentLibrary(): void {
    const libraryId = this.layoutSelectedStore?.id ?? this.currentLibraryId ?? this.activeLibraryStatsId;
    if (!libraryId) {
      this.goToLibraryPicker();
      return;
    }

    const queryParams: Record<string, string> = { libraryId };
    const workspaceTab = this.route.snapshot.queryParamMap.get('workspaceTab');
    if (workspaceTab) {
      queryParams['workspaceTab'] = workspaceTab;
    }

    this.router.navigate(['/workspace'], { queryParams });
  }

  onSidebarSearchChange(value: string): void {
    this.librarySearchQuery = value;
    this.knowledgeContext.setSidebarSearch(value);
  }

  goToHome(): void {
    this.router.navigate(['/home']);
  }

  onBrandClick(): void {
    if (this.sidebarCollapsed) {
      return;
    }
    this.goToHome();
  }

  toggleSidebar(forceState?: boolean, event?: MouseEvent): void {
    event?.stopPropagation();
    const nextState = typeof forceState === 'boolean' ? forceState : !this.sidebarCollapsed;
    if (nextState === this.sidebarCollapsed) {
      return;
    }
    this.sidebarCollapsed = nextState;
    if (!nextState) {
      this.resetExpandControlState();
    }
  }

  handleBrandExpandInteraction(active: boolean): void {
    this.brandExpandInteraction = active;
    this.updateExpandControlState();
  }

  handleToggleExpandInteraction(active: boolean): void {
    this.toggleExpandInteraction = active;
    this.updateExpandControlState();
  }

  private updateExpandControlState(): void {
    if (!this.sidebarCollapsed) {
      this.resetExpandControlState();
      return;
    }
    this.hoveringExpandControl = this.brandExpandInteraction || this.toggleExpandInteraction;
  }

  private resetExpandControlState(): void {
    this.brandExpandInteraction = false;
    this.toggleExpandInteraction = false;
    this.hoveringExpandControl = false;
  }

  private applyLayoutRouteState(): void {
    this.showLibraryPicker = !this.activeDocumentId && !this.activeLibraryStatsId && !this.currentLibraryId && this.currentView !== 'prompts';
    this.activeSection = this.currentView === 'prompts' ? 'prompts' : 'knowledge';
  }

  private ensureSidebarLibraries(): void {
    if (this.activeSection !== 'knowledge') {
      return;
    }

    if (this.layoutVectorStores.length > 0) {
      const targetLibraryId = this.currentLibraryId || this.activeLibraryStatsId;
      if (targetLibraryId) {
        this.layoutSelectedStore = this.layoutVectorStores.find(store => store.id === targetLibraryId) || null;
      }
      return;
    }

    this.vectorStoreService.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: stores => {
        this.layoutVectorStores = stores;
        const targetLibraryId = this.currentLibraryId || this.activeLibraryStatsId;
        const selectedStore = targetLibraryId
          ? stores.find(store => store.id === targetLibraryId) || null
          : this.layoutSelectedStore;

        this.layoutSelectedStore = selectedStore;
        this.knowledgeContext.updateState({
          vectorStores: stores,
          selectedVectorStore: selectedStore
        });
      },
      error: () => {
        this.layoutVectorStores = [];
      }
    });
  }

  logout(): void {
    const token = this.authService.getToken();
    if (token) {
      this.authService.logout(token).subscribe({
        next: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        },
        error: () => {
          this.authService.clearAuth();
          this.router.navigate(['/auth/login']);
        }
      });
    } else {
      this.authService.clearAuth();
      this.router.navigate(['/auth/login']);
    }
  }
}
