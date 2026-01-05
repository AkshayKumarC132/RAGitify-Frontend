import { Component, OnInit } from '@angular/core';
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
  errorMessage = '';
  editingAssistant: Assistant | null = null;

  constructor(
    private assistantService: AssistantService,
    private vectorStoreService: VectorStoreService,
    private confirmDialogService: ConfirmDialogService,
    private fb: FormBuilder
  ) {
    this.createForm = this.fb.group({
      name: ['', Validators.required],
      vector_store_id: [''],
      instructions: [''],
      model: ['']
    });

    this.editForm = this.fb.group({
      name: ['', Validators.required],
      vector_store_id: [''],
      instructions: [''],
      model: ['']
    });
  }

  ngOnInit(): void {
    this.loadAssistants();
    this.loadVectorStores();
  }

  loadAssistants(): void {
    this.assistantService.list().subscribe({
      next: (assistants) => {
        this.assistants = assistants;
      },
      error: (err) => console.error('Error loading assistants:', err)
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
  }

  startEdit(assistant: Assistant): void {
    this.editingAssistant = assistant;
    this.editForm.reset({
      name: assistant.name,
      vector_store_id: assistant.vector_store_id || '',
      instructions: assistant.instructions || '',
      model: assistant.model || ''
    });
  }

  cancelEdit(): void {
    this.editingAssistant = null;
    this.editForm.reset({
      name: '',
      vector_store_id: '',
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
        vector_store_id: formValue.vector_store_id || undefined,
        instructions: formValue.instructions || undefined,
        model: formValue.model || undefined,
        tools: []
      }).subscribe({
        next: () => {
          this.loading = false;
          this.createForm.reset({
            name: '',
            vector_store_id: '',
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

    this.editLoading = true;
    this.errorMessage = '';
    const formValue = this.editForm.value;

    this.assistantService.update(this.editingAssistant.id, {
      name: formValue.name,
      vector_store_id: formValue.vector_store_id || undefined,
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

  async deleteAssistant(assistant: Assistant): Promise<void> {
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
    return instructions.length > 180 ? `${instructions.slice(0, 180)}…` : instructions;
  }

  vectorStoreLabel(vectorStoreId?: string): string {
    if (!vectorStoreId) {
      return 'No knowledge base';
    }
    const store = this.vectorStores.find(vs => vs.id === vectorStoreId);
    return store ? store.name : vectorStoreId;
  }
}

