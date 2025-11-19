import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AssistantService } from '../../../shared/services/assistant.service';
import { Assistant, Tool } from '../../../shared/models/assistant.model';

@Component({
  selector: 'app-tools-section',
  templateUrl: './tools-section.component.html',
  styleUrls: ['./tools-section.component.scss']
})
export class ToolsSectionComponent implements OnInit {
  assistants: Assistant[] = [];
  selectedAssistant: Assistant | null = null;
  showToolForm = false;
  toolForm: FormGroup;
  loading = false;
  loadingAssistants = false;

  constructor(
    private assistantService: AssistantService,
    private fb: FormBuilder
  ) {
    this.toolForm = this.fb.group({
      type: ['function', Validators.required],
      name: ['', Validators.required],
      description: ['', Validators.required],
      parameters: ['{}']
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
        if (this.selectedAssistant) {
          this.selectedAssistant = assistants.find(a => a.id === this.selectedAssistant?.id) || null;
        }
        this.loadingAssistants = false;
      },
      error: (err) => {
        console.error('Error loading assistants:', err);
        this.loadingAssistants = false;
      }
    });
  }

  selectAssistant(assistant: Assistant): void {
    this.selectedAssistant = assistant;
    this.showToolForm = false;
    this.toolForm.reset({
      type: 'function',
      name: '',
      description: '',
      parameters: '{}'
    });
  }

  toggleToolForm(): void {
    this.showToolForm = !this.showToolForm;
  }

  onToolSubmit(): void {
    if (this.toolForm.valid && this.selectedAssistant) {
      this.loading = true;
      
      try {
        const parameters = JSON.parse(this.toolForm.value.parameters);
        const tool: Tool = {
          type: this.toolForm.value.type,
          function: {
            name: this.toolForm.value.name,
            description: this.toolForm.value.description,
            parameters: {
              type: 'object',
              properties: parameters.properties || {},
              required: parameters.required || []
            }
          }
        };

        const updatedTools = [...(this.selectedAssistant.tools || []), tool];
        
        this.assistantService.update(this.selectedAssistant.id, {
          tools: updatedTools
        }).subscribe({
          next: () => {
            this.loading = false;
            this.toggleToolForm();
            this.loadAssistants();
            if (this.selectedAssistant) {
              this.selectedAssistant = { ...this.selectedAssistant, tools: updatedTools };
            }
          },
          error: (err) => {
            this.loading = false;
            console.error('Error adding tool:', err);
          }
        });
      } catch (error) {
        this.loading = false;
        alert('Invalid JSON in parameters field');
      }
    }
  }

  removeTool(index: number): void {
    if (!this.selectedAssistant) {
      return;
    }

    if (!confirm('Remove this tool from the assistant?')) {
      return;
    }

    const updatedTools = [...(this.selectedAssistant.tools || [])];
    updatedTools.splice(index, 1);
    this.loading = true;

    this.assistantService.update(this.selectedAssistant.id, { tools: updatedTools }).subscribe({
      next: () => {
        this.loading = false;
        this.loadAssistants();
      },
      error: (err) => {
        this.loading = false;
        console.error('Error removing tool:', err);
      }
    });
  }
}

