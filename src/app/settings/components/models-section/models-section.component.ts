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
  selectedProvider: 'OpenAI' | 'Ollama' | 'Claude' | null = null;

  viewMode: 'grid' | 'list' = 'list';
  searchQuery: string = '';

  modelOptions: Record<'OpenAI' | 'Ollama' | 'Claude', string[]> = {
    OpenAI: ['gpt-5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-3.5-turbo'],
    Ollama: ['llama3.1:latest', 'llama3', 'mistral'],
    Claude: ['claude-3-5-sonnet', 'claude-3-opus']
  };

  MODEL_METADATA_CONFIG: Record<string, any> = {
    'gpt-5.4-mini': { capabilities: ['Vision', 'Tools', 'JSON'], context: '256K', inOutPrice: '$0.25 / $1.00', speed: 'Fast', speedIcon: 'fa-bolt' },
    'gpt-5': { capabilities: ['Vision', 'Tools', 'Reasoning'], context: '400K', inOutPrice: '$2.50 / $10.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'gpt-5.4': { capabilities: [], context: '512K', inOutPrice: '$3.00 / $12.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'gpt-4.1': { capabilities: [], context: '128K', inOutPrice: '$2.00 / $8.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'gpt-5.4-nano': { capabilities: [], context: '128K', inOutPrice: '$0.05 / $0.20', speed: 'Fast', speedIcon: 'fa-bolt' },
    'gpt-5.2': { capabilities: [], context: '256K', inOutPrice: '$1.50 / $6.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'gpt-4o': { capabilities: ['Vision', 'Tools', 'JSON'], context: '128K', inOutPrice: '$5.00 / $15.00', speed: 'Fast', speedIcon: 'fa-bolt' },
    'gpt-4o-mini': { capabilities: ['Vision', 'Tools', 'JSON'], context: '128K', inOutPrice: '$0.15 / $0.60', speed: 'Fast', speedIcon: 'fa-bolt' },
    'gpt-3.5-turbo': { capabilities: [], context: '16K', inOutPrice: '$0.50 / $1.50', speed: 'Fast', speedIcon: 'fa-bolt' },
    'claude-3-5-sonnet': { capabilities: ['Vision', 'Tools'], context: '200K', inOutPrice: '$3.00 / $15.00', speed: 'Fast', speedIcon: 'fa-bolt' },
    'claude-3-opus': { capabilities: ['Vision', 'Tools', 'Reasoning'], context: '200K', inOutPrice: '$15.00 / $75.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'llama3.1:latest': { capabilities: ['Tools'], context: '128K', inOutPrice: '$0.00 / $0.00', speed: 'Medium', speedIcon: 'fa-bolt' },
    'llama3': { capabilities: [], context: '8K', inOutPrice: '$0.00 / $0.00', speed: 'Fast', speedIcon: 'fa-bolt' },
    'mistral': { capabilities: [], context: '32K', inOutPrice: '$0.00 / $0.00', speed: 'Fast', speedIcon: 'fa-bolt' },
  };

  availableProviders: ProviderOption[] = [
    {
      name: 'OpenAI',
      description: 'GPT family · Vision · Tools',
      defaultModel: 'gpt-5.4-mini',
      requiresApiKey: true
    },
    {
      name: 'Anthropic',
      description: 'Claude Sonnet & Opus',
      defaultModel: 'claude-3-5-sonnet',
      requiresApiKey: true
    },
    {
      name: 'Ollama',
      description: 'Run open-source models locally.',
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
      model: ['gpt-5.4-mini'],
      api_key: [''],
      is_active: [false]
    });
  }

  ngOnInit(): void {
    this.authService.refreshUserStatus().subscribe((status: UserStatus | null) => {
      const provider = status?.selected_llm_provider || (status as any)?.active_provider || null;
      if (provider === 'OpenAI' || provider === 'Ollama' || provider === 'Claude') {
        this.selectedProvider = provider;
        this.createForm.patchValue({
          provider,
          model: this.availableProviders.find(p => p.name === provider)?.defaultModel || 'gpt-5.4-mini'
        });
      }
      this.loadModels(true);
    });
  }

  loadModels(forceRefresh = false): void {
    this.loadingModels = true;
    this.openAIKeyService.list(forceRefresh).subscribe({
      next: (models) => {
        this.models = models;
        this.loadingModels = false;
      },
      error: (err) => {
        console.error('Error loading models:', err);
        this.loadingModels = false;
      }
    });
  }

  isProviderConnected(providerName: string): boolean {
    const internalName = providerName === 'Anthropic' ? 'Claude' : providerName;
    return this.models.some(m => m.provider === internalName);
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.createForm.reset({
        provider: this.selectedProvider || 'OpenAI',
        model: 'gpt-5.4-mini',
        is_active: false
      });
    }
  }

  async connectProvider(provider: ProviderOption): Promise<void> {
    const internalName = provider.name === 'Anthropic' ? 'Claude' : provider.name;

    // Determine the currently active provider from the active model
    const activeModel = this.models.find(m => m.is_active);
    const currentProvider = activeModel?.provider ?? null;

    // Show a warning only when switching away from OpenAI or Ollama to a different provider
    const warningProviders: string[] = ['OpenAI', 'Ollama'];
    if (
      currentProvider &&
      warningProviders.includes(currentProvider) &&
      internalName !== currentProvider
    ) {
      const confirmed = await this.confirmDialogService.confirm({
        type: 'warning',
        title: 'Switch AI provider?',
        message: `You are switching from ${currentProvider} to ${provider.name}.`,
        secondaryMessage: 'This will clear all existing model data and reset the session. Any unsaved configuration will be lost.',
        confirmText: 'Yes, switch provider',
        cancelText: 'Keep current provider'
      });

      if (!confirmed) return;
    }

    this.showCreateForm = true;
    this.createForm.patchValue({
      provider: internalName,
      model: provider.defaultModel,
      api_key: provider.requiresApiKey ? '' : null,
      is_active: this.models.length === 0
    });
  }

  chooseModel(model: string): void {
    this.createForm.patchValue({ model });
  }

  get availableModelOptions(): string[] {
    const selected = this.createForm.get('provider')?.value;
    if (!selected) return [];
    return this.modelOptions[selected as 'OpenAI' | 'Ollama' | 'Claude'] || [];
  }

  get filteredModels(): OpenAIKey[] {
    let result = this.models;
    if (this.searchQuery) {
      const qs = this.searchQuery.toLowerCase();
      result = result.filter(m =>
        (m.name || '').toLowerCase().includes(qs) ||
        m.model.toLowerCase().includes(qs) ||
        m.provider.toLowerCase().includes(qs)
      );
    }
    // Active model always first
    return [...result].sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));
  }

  getMetadata(modelName: string) {
    // try to match exactly first
    if (this.MODEL_METADATA_CONFIG[modelName]) {
      return this.MODEL_METADATA_CONFIG[modelName];
    }
    // Partial matching
    for (const key of Object.keys(this.MODEL_METADATA_CONFIG)) {
      if (modelName.includes(key) || key.includes(modelName)) {
        return this.MODEL_METADATA_CONFIG[key];
      }
    }
    // Fallback
    return { capabilities: [], context: '128K', inOutPrice: '$? / $?', speed: 'Medium', speedIcon: 'fa-bolt' };
  }

  getProviderLogoPath(provider: string): string {
    const p = provider.toLowerCase();
    if (p === 'claude' || p === 'anthropic') return 'assets/anthropic.svg';
    if (p === 'ollama') return 'assets/ollama.svg';
    return 'assets/openai.svg';
  }

  getDisplayName(model: OpenAIKey): string {
    if (model.name) return model.name;
    // Strip trailing date suffix like -2026-03-17
    let id = model.model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    if (id.startsWith('gpt-')) {
      return 'GPT-' + id.slice(4).replace(/-/g, ' ');
    }
    if (id.startsWith('claude-')) {
      return 'Claude ' + id.slice(7).replace(/-/g, ' ');
    }
    if (id.startsWith('llama')) {
      return id.replace(/:/g, ' ');
    }
    return id.replace(/-/g, ' ');
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

  setActive(model: OpenAIKey): void {
    this.openAIKeyService.update(model.id, this.buildModelUpdatePayload(model, true)).subscribe({
      next: () => {
        this.loadModels();
        this.openAIKeyService.fetchAndCacheActiveModel();
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
        this.openAIKeyService.fetchAndCacheActiveModel();
      },
      error: (err) => {
        console.error('Error deleting model:', err);
      }
    });
  }
}

interface ProviderOption {
  name: string;
  description: string;
  defaultModel: string;
  requiresApiKey: boolean;
}
