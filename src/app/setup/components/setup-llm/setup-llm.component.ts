import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { LlmProviderOption } from '../../../shared/models/user.model';

@Component({
  selector: 'app-setup-llm',
  templateUrl: './setup-llm.component.html',
  styleUrls: ['./setup-llm.component.scss']
})
export class SetupLlmComponent implements OnInit {
  setupForm: FormGroup;
  submitting = false;
  errorMessage = '';
  infoMessage = 'Choose a provider and collection to unlock RAG features.';

  providerOptions: { value: LlmProviderOption; label: string; description: string }[] = [
    { value: 'openai', label: 'OpenAI', description: 'Cloud provider (1536-dim embeddings).' },
    { value: 'ollama', label: 'Ollama', description: 'Local runtime (1024-dim embeddings).' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.setupForm = this.fb.group({
      llm_provider: ['', Validators.required],
      collection_name: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'llm_required') {
      this.infoMessage = 'LLM setup required to continue.';
    }

    const cachedStatus = this.authService.getCurrentStatus();
    if (this.authService.isLlmReady(cachedStatus)) {
      this.router.navigate(['/home']);
      return;
    }

    this.authService.ensureStatus().subscribe(status => {
      if (this.authService.isLlmReady(status)) {
        this.router.navigate(['/home']);
      }
    });
  }

  submitSetup(): void {
    if (this.setupForm.invalid) {
      this.setupForm.markAllAsTouched();
      return;
    }

    const collectionName: string = (this.setupForm.value.collection_name || '').trim();
    if (!collectionName) {
      this.setupForm.get('collection_name')?.setErrors({ required: true });
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.authService.completeLlmSetup({
      llm_provider: this.setupForm.value.llm_provider as LlmProviderOption,
      collection_name: collectionName
    }).subscribe({
      next: (status) => {
        this.submitting = false;
        if (this.authService.isLlmReady(status)) {
          this.router.navigate(['/home']);
        } else {
          this.infoMessage = 'Setup saved. Waiting for collection to become ready...';
        }
      },
      error: (error) => {
        this.submitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || 'Unable to complete LLM setup. Please try again.';
      }
    });
  }

  selectProvider(value: LlmProviderOption): void {
    this.setupForm.get('llm_provider')?.setValue(value);
  }

  providerIsSelected(value: LlmProviderOption): boolean {
    return this.setupForm.get('llm_provider')?.value === value;
  }

  get providerDimensionHint(): string {
    const provider = this.setupForm.get('llm_provider')?.value as LlmProviderOption | '';
    if (provider === 'openai') {
      return 'OpenAI collections are locked to 1536 embedding dimensions.';
    }
    if (provider === 'ollama') {
      return 'Ollama collections are locked to 1024 embedding dimensions.';
    }
    return 'Select a provider to view embedding constraints.';
  }

  backToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
