import { Component, Input, Output, EventEmitter } from '@angular/core';
import { OpenAIKey } from '../../../shared/models/openai-key.model';

@Component({
  selector: 'app-model-selector',
  templateUrl: './model-selector.component.html',
  styleUrls: ['./model-selector.component.scss']
})
export class ModelSelectorComponent {
  @Input() models: OpenAIKey[] = [];
  @Input() selectedModel: OpenAIKey | null = null;
  @Output() modelSelected = new EventEmitter<OpenAIKey>();

  showDropdown = false;

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectModel(model: OpenAIKey): void {
    this.selectedModel = model;
    this.modelSelected.emit(model);
    this.showDropdown = false;
  }

  getDisplayName(model: OpenAIKey): string {
    return model.name || `${model.provider} - ${model.model}`;
  }
}

