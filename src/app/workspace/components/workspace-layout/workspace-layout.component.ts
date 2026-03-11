import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../shared/services/auth.service';
import { WorkspaceKnowledgeContextService } from '../../services/workspace-knowledge-context.service';
import { VectorStore } from '../../../shared/models/vector-store.model';

@Component({
  selector: 'app-workspace-layout',
  templateUrl: './workspace-layout.component.html',
  styleUrls: ['./workspace-layout.component.scss']
})
export class WorkspaceLayoutComponent implements OnInit, OnDestroy {
  activeSection: 'knowledge' | 'prompts' = 'knowledge';
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
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.knowledgeContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.layoutVectorStores = state.vectorStores;
        this.layoutSelectedStore = state.selectedVectorStore;
        this.libraryDocCounts = state.documentCounts;
        this.totalDocumentsCount = state.totalDocuments;
      });

    // Show library picker when no library selected; show main UI when libraryId or view=prompts
    this.route.queryParamMap.subscribe(params => {
      const libraryId = params.get('libraryId');
      const view = params.get('view');
      this.showLibraryPicker = !libraryId && view !== 'prompts';
      this.activeSection = view === 'prompts' ? 'prompts' : 'knowledge';
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

  openUploadOrNewLibrary(action: 'upload' | 'library'): void {
    if (action === 'upload') {
      this.knowledgeContext.openUploadPanel.next();
    } else {
      this.knowledgeContext.openNewLibraryPanel.next();
    }
  }

  onLayoutEditLibrary(store: VectorStore): void {
    this.knowledgeContext.editLibraryRequested.next(store);
  }

  onLayoutDeleteLibrary(store: VectorStore): void {
    this.knowledgeContext.deleteLibraryRequested.next(store);
  }

  onLayoutChatLibrary(store: VectorStore): void {
    this.knowledgeContext.chatLibraryRequested.next(store);
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
    const libraryId = this.layoutSelectedStore?.id ?? this.route.snapshot.queryParamMap.get('libraryId');
    this.router.navigate(['/workspace'], { queryParams: libraryId ? { libraryId } : {} });
  }

  goToPrompts(): void {
    this.router.navigate(['/workspace'], { queryParams: { view: 'prompts' } });
  }

  goToLibraryPicker(): void {
    this.router.navigate(['/workspace'], { queryParams: {} });
  }

  onSidebarSearchChange(value: string): void {
    this.librarySearchQuery = value;
    this.knowledgeContext.setSidebarSearch(value);
  }

  goToHome(): void {
    this.router.navigate(['/home']);
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
