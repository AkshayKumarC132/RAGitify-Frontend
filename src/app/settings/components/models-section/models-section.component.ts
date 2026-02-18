import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
  state
} from '@angular/animations';
import { OpenAIKeyService } from '../../../shared/services/openai-key.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { OpenAIKey, OpenAIKeyCreateRequest } from '../../../shared/models/openai-key.model';
import { AuthService } from '../../../shared/services/auth.service';
import { UserStatus } from '../../../shared/models/user.model';

@Component({
  selector: 'app-models-section',
  templateUrl: './models-section.component.html',
  styleUrls: ['./models-section.component.scss'],
  animations: [
    trigger('expandCollapse', [
      state('void', style({ height: '0', opacity: '0', overflow: 'hidden' })),
      state('*', style({ height: '*', opacity: '1', overflow: 'hidden' })),
      transition(':enter', [
        style({ height: '0', opacity: '0', overflow: 'hidden' }),
        animate('220ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: '*', opacity: '1' }))
      ]),
      transition(':leave', [
        animate('180ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: '0', opacity: '0' }))
      ])
    ]),
    trigger('listStagger', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(50, [
            animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class ModelsSectionComponent implements OnInit {
  models: OpenAIKey[] = [];
  showCreateForm = false;
  createForm: FormGroup;
  loading = false;
  loadingModels = false;
  errorMessage = '';
  selectedProvider: 'OpenAI' | 'Ollama' | null = null;
  modelOptions: Record<'OpenAI' | 'Ollama', string[]> = {
    OpenAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-3.5-turbo'],
    Ollama: ['llama3.1:latest', 'llama3', 'mistral']
  };
  availableProviders: ProviderOption[] = [
    {
      name: 'OpenAI',
      badge: 'Cloud',
      icon: 'fa-cloud',
      description: 'Access GPT-4.1 through the official OpenAI API.',
      defaultModel: 'gpt-4.1',
      requiresApiKey: true
    },
    {
      name: 'Ollama',
      badge: 'Local',
      icon: 'fa-microchip',
      description: 'Run open-source models like Llama 3 locally via the Ollama runtime.',
      defaultModel: 'llama3.1:latest',
      requiresApiKey: false
    }
  ];

  constructor(
    private openAIKeyService: OpenAIKeyService,
    private confirmDialogService: ConfirmDialogService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.createForm = this.fb.group({
      name: [''],
      provider: ['OpenAI', Validators.required],
      model: ['gpt-4.1'],
      api_key: [''],
      is_active: [false]
    });
  }

  ngOnInit(): void {
    this.authService.refreshUserStatus().subscribe((status: UserStatus | null) => {
      const provider = status?.selected_llm_provider || (status as any)?.active_provider || null;
      if (provider === 'OpenAI' || provider === 'Ollama') {
        this.selectedProvider = provider;
        this.createForm.patchValue({
          provider,
          model: provider === 'Ollama' ? 'llama3.1:latest' : 'gpt-4.1'
        });
        this.createForm.get('provider')?.disable({ emitEvent: false });
      } else {
        this.createForm.get('provider')?.enable({ emitEvent: false });
      }
      this.loadModels(true);
    });
  }

  loadModels(forceRefresh = false): void {
    this.loadingModels = true;
    this.openAIKeyService.list(forceRefresh).subscribe({
      next: (models) => {
        this.models = this.selectedProvider ? models.filter(m => m.provider === this.selectedProvider) : models;
        this.loadingModels = false;
      },
      error: (err) => {
        console.error('Error loading models:', err);
        this.loadingModels = false;
      }
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.createForm.reset({
        provider: this.selectedProvider || 'OpenAI',
        model: this.selectedProvider === 'Ollama' ? 'llama3.1:latest' : 'gpt-4.1',
        is_active: false
      });
      if (this.selectedProvider) {
        this.createForm.get('provider')?.disable({ emitEvent: false });
      } else {
        this.createForm.get('provider')?.enable({ emitEvent: false });
      }
    }
  }

  connectProvider(provider: ProviderOption): void {
    if (this.selectedProvider && provider.name !== this.selectedProvider) {
      return;
    }
    this.showCreateForm = true;
    this.createForm.patchValue({
      provider: provider.name,
      model: provider.defaultModel,
      api_key: provider.requiresApiKey ? '' : null,
      is_active: this.models.length === 0
    });
    if (this.selectedProvider) {
      this.createForm.get('provider')?.disable({ emitEvent: false });
    }
  }

  chooseModel(model: string): void {
    this.createForm.patchValue({ model });
  }

  get availableModelOptions(): string[] {
    if (!this.selectedProvider) {
      return [];
    }
    return this.modelOptions[this.selectedProvider] || [];
  }

  get displayedProviders(): ProviderOption[] {
    if (this.selectedProvider) {
      return this.availableProviders.filter(p => p.name === this.selectedProvider);
    }
    return this.availableProviders;
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
  private buildModelUpdatePayload(model: OpenAIKey, isActive: boolean): Partial<OpenAIKeyCreateRequest> {
    return {
      name: model.name,
      provider: model.provider,
      model: model.model,
      api_key: model.api_key,
      is_active: isActive
    };
  }

  get shouldUseModelListScroll(): boolean {
    return this.models.length > 5;
  }

  setActive(model: OpenAIKey): void {
    this.openAIKeyService.update(model.id, this.buildModelUpdatePayload(model, true)).subscribe({
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
  icon: string;
  defaultModel: string;
  requiresApiKey: boolean;
}


