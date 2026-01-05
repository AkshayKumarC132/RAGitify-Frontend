import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OpenAIKeyService } from '../../../shared/services/openai-key.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { OpenAIKey, OpenAIKeyCreateRequest } from '../../../shared/models/openai-key.model';

@Component({
  selector: 'app-models-section',
  templateUrl: './models-section.component.html',
  styleUrls: ['./models-section.component.scss']
})
export class ModelsSectionComponent implements OnInit {
  models: OpenAIKey[] = [];
  showCreateForm = false;
  createForm: FormGroup;
  loading = false;
  errorMessage = '';
  availableProviders: ProviderOption[] = [
    {
      name: 'OpenAI',
      badge: 'Cloud',
      description: 'Access GPT-4o and GPT-4o mini through the official OpenAI API.',
      defaultModel: 'gpt-4o',
      requiresApiKey: true
    },
    {
      name: 'Ollama',
      badge: 'Local',
      description: 'Run open-source models like Llama 3 locally via the Ollama runtime.',
      defaultModel: 'llama3.1:latest',
      requiresApiKey: false
    }
  ];

  constructor(
    private openAIKeyService: OpenAIKeyService,
    private confirmDialogService: ConfirmDialogService,
    private fb: FormBuilder
  ) {
    this.createForm = this.fb.group({
      name: [''],
      provider: ['OpenAI', Validators.required],
      model: ['gpt-4o'],
      api_key: [''],
      is_active: [false]
    });
  }

  ngOnInit(): void {
    this.loadModels();
  }

  loadModels(): void {
    this.openAIKeyService.list().subscribe({
      next: (models) => {
        this.models = models;
      },
      error: (err) => {
        console.error('Error loading models:', err);
      }
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.createForm.reset({
        provider: 'OpenAI',
        model: 'gpt-4o',
        is_active: false
      });
    }
  }

  connectProvider(provider: ProviderOption): void {
    this.showCreateForm = true;
    this.createForm.patchValue({
      provider: provider.name,
      model: provider.defaultModel,
      api_key: provider.requiresApiKey ? '' : null,
      is_active: this.models.length === 0
    });
  }

  onCreateSubmit(): void {
    if (this.createForm.valid) {
      this.loading = true;
      this.errorMessage = '';

      const formValue = this.createForm.value;
      const request: OpenAIKeyCreateRequest = {
        name: formValue.name || undefined,
        provider: formValue.provider,
        model: formValue.model,
        api_key: formValue.api_key || undefined,
        is_active: formValue.is_active
      };

      this.openAIKeyService.create(request).subscribe({
        next: () => {
          this.loading = false;
          this.toggleCreateForm();
          this.loadModels();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.api_key || err.error?.error || 'Failed to create model';
        }
      });
    }
  }

  setActive(model: OpenAIKey): void {
    this.openAIKeyService.update(model.id, { is_active: true }).subscribe({
      next: () => {
        this.loadModels();
      },
      error: (err) => {
        console.error('Error setting active model:', err);
      }
    });
  }

  async deleteModel(id: number): Promise<void> {
    const model = this.models.find(m => m.id === id);
    const modelName = model?.name || (model ? `${model.provider} - ${model.model}` : 'this model');
    
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete model?',
      message: 'This will delete',
      itemName: modelName
    });
    if (!confirmed) {
      return;
    }

    this.openAIKeyService.delete(id).subscribe({
      next: () => {
        this.loadModels();
      },
      error: (err) => {
        console.error('Error deleting model:', err);
      }
    });
  }
}

interface ProviderOption {
  name: 'OpenAI' | 'Ollama';
  description: string;
  badge: string;
  defaultModel: string;
  requiresApiKey: boolean;
}
