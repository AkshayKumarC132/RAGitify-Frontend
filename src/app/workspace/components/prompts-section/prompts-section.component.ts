import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AssistantService } from '../../../shared/services/assistant.service';
import { VectorStoreService } from '../../../shared/services/vector-store.service';
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
  loading = false;
  errorMessage = '';

  constructor(
    private assistantService: AssistantService,
    private vectorStoreService: VectorStoreService,
    private fb: FormBuilder
  ) {
    this.createForm = this.fb.group({
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

  deleteAssistant(assistant: Assistant): void {
    if (!confirm(`Delete prompt "${assistant.name}"?`)) {
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

