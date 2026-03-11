import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { VectorStore } from '../../shared/models/vector-store.model';

export interface WorkspaceKnowledgeState {
  vectorStores: VectorStore[];
  selectedVectorStore: VectorStore | null;
  documentCounts: Record<string, number>;
  totalDocuments: number;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceKnowledgeContextService {
  private state = new BehaviorSubject<WorkspaceKnowledgeState>({
    vectorStores: [],
    selectedVectorStore: null,
    documentCounts: {},
    totalDocuments: 0
  });

  readonly state$ = this.state.asObservable();

  /** Fired when layout wants to open the upload panel */
  readonly openUploadPanel = new Subject<void>();
  /** Fired when layout wants to open the new library form */
  readonly openNewLibraryPanel = new Subject<void>();
  /** Fired when user requests edit/delete/chat from layout sidebar */
  readonly editLibraryRequested = new Subject<VectorStore>();
  readonly deleteLibraryRequested = new Subject<VectorStore>();
  readonly chatLibraryRequested = new Subject<VectorStore>();
  private pendingLibraryChat = new BehaviorSubject<VectorStore | null>(null);
  readonly pendingLibraryChat$ = this.pendingLibraryChat.asObservable();

  /** Sidebar search query (libraries + documents) */
  private sidebarSearch = new BehaviorSubject<string>('');
  readonly sidebarSearch$ = this.sidebarSearch.asObservable();

  get currentState(): WorkspaceKnowledgeState {
    return this.state.value;
  }

  updateState(partial: Partial<WorkspaceKnowledgeState>): void {
    this.state.next({ ...this.state.value, ...partial });
  }

  setSelectedStore(store: VectorStore | null): void {
    this.state.next({
      ...this.state.value,
      selectedVectorStore: store
    });
  }

  setSidebarSearch(query: string): void {
    this.sidebarSearch.next(query);
  }

  requestPendingLibraryChat(store: VectorStore): void {
    this.pendingLibraryChat.next(store);
  }

  consumePendingLibraryChat(): VectorStore | null {
    const store = this.pendingLibraryChat.value;
    if (store) {
      this.pendingLibraryChat.next(null);
    }
    return store;
  }
}
