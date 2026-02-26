import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AssistantService } from '../../../shared/services/assistant.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { Assistant } from '../../../shared/models/assistant.model';
import { VectorStore } from '../../../shared/models/vector-store.model';

@Component({
  selector: 'app-prompts-section',
  templateUrl: './prompts-section.component.html',
  styleUrls: ['./prompts-section.component.scss']
})
export class PromptsSectionComponent implements OnInit {
  assistants: Assistant[] = [];
  vectorStores: VectorStore[] = [];
  showCreateForm = false;
  createForm: FormGroup;
  editForm: FormGroup;
  loading = false;
  editLoading = false;
  loadingAssistants = false;
  errorMessage = '';
  editingAssistant: Assistant | null = null;
  testingAssistant: Assistant | null = null;
  viewMode: 'list' | 'grid' = 'list';

  constructor(
    private assistantService: AssistantService,
    private vectorStoreService: VectorStoreService,
    private confirmDialogService: ConfirmDialogService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.createForm = this.fb.group({
      name: ['', Validators.required],
      instructions: [''],
      model: ['']
    });

    this.editForm = this.fb.group({
      name: ['', Validators.required],
      instructions: [''],
      model: ['']
    });
  }

  ngOnInit(): void {
    this.loadAssistants();
  }

  loadAssistants(): void {
    this.loadingAssistants = true;
    this.assistantService.list().subscribe({
      next: (assistants) => {
        this.assistants = assistants;
        this.loadingAssistants = false;
      },
      error: (err) => {
        console.error('Error loading assistants:', err);
        this.loadingAssistants = false;
      }
    });
  }

  loadVectorStores(): void {
    this.vectorStoreService.list().subscribe({
      next: (stores) => {
        this.vectorStores = stores;
      },
      error: (err) => console.error('Error loading library:', err)
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (this.showCreateForm && !this.vectorStores.length) {
      this.loadVectorStores();
    }
  }

  startEdit(assistant: Assistant): void {
    // Prevent editing default prompts
    if (assistant.is_default === true) {
      return;
    }
    this.editingAssistant = assistant;
    this.editForm.reset({
      name: assistant.name,
      instructions: assistant.instructions || '',
      model: assistant.model || ''
    });
  }

  cancelEdit(): void {
    this.editingAssistant = null;
    this.editForm.reset({
      name: '',
      instructions: '',
      model: ''
    });
    this.editLoading = false;
  }

  onCreateSubmit(): void {
    if (this.createForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      const formValue = this.createForm.value;

      this.assistantService.create({
        name: formValue.name,
        instructions: formValue.instructions || undefined,
        model: formValue.model || undefined,
        tools: []
      }).subscribe({
        next: () => {
          this.loading = false;
          this.createForm.reset({
            name: '',
            instructions: '',
            model: ''
          });
          this.toggleCreateForm();
          this.loadAssistants();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.error || 'Failed to create prompt.';
          console.error('Error creating assistant:', err);
        }
      });
    }
  }

  onEditSubmit(): void {
    if (!this.editingAssistant || this.editForm.invalid) {
      return;
    }

    // Prevent editing default prompts
    if (this.editingAssistant.is_default === true) {
      this.errorMessage = 'Default prompt cannot be edited.';
      return;
    }

    this.editLoading = true;
    this.errorMessage = '';
    const formValue = this.editForm.value;

    this.assistantService.update(this.editingAssistant.id, {
      name: formValue.name,
      vector_store_id: this.editingAssistant.vector_store_id || undefined,
      instructions: formValue.instructions || undefined,
      model: formValue.model || undefined,
      tools: this.editingAssistant.tools || []
    }).subscribe({
      next: () => {
        this.editLoading = false;
        this.cancelEdit();
        this.loadAssistants();
      },
      error: (err) => {
        this.editLoading = false;
        this.errorMessage = err.error?.error || 'Failed to update prompt.';
        console.error('Error updating assistant:', err);
      }
    });
  }

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode = mode;
  }

  async deleteAssistant(assistant: Assistant): Promise<void> {
    // Prevent deleting default prompts
    if (assistant.is_default === true) {
      return;
    }
    
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete prompt?',
      message: 'This will delete',
      itemName: assistant.name
    });
    if (!confirmed) {
      return;
    }

    this.assistantService.delete(assistant.id).subscribe({
      next: () => this.loadAssistants(),
      error: (err) => console.error('Error deleting assistant:', err)
    });
  }

  instructionsPreview(instructions?: string): string {
    if (!instructions) {
      return 'No instructions provided.';
    }    
    const lines = instructions.split('\n');
    const firstLines = lines.slice(0, 3).join('\n').trim();
    if (!firstLines) {
      return 'No instructions provided.';
    }
    return firstLines.length > 220 ? `${firstLines.slice(0, 220)}…` : firstLines;
  }

  vectorStoreLabel(vectorStoreId?: string): string {
    if (!vectorStoreId) {
      return '';
    }
    const store = this.vectorStores.find(vs => vs.id === vectorStoreId);
    return store ? store.name : vectorStoreId;
  }

  testAssistant(assistant: Assistant): void {
    this.editingAssistant = null; // Close edit form if open
    this.testingAssistant = assistant;
  }

  closeTestChat(): void {
    this.testingAssistant = null;
  }
}
