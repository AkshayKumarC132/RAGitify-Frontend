import { Component } from '@angular/core';

@Component({
  selector: 'app-typing-indicator',
  template: `
    <div class="typing-message">
      <span class="typing-text">Typing<span class="typing-dots"></span></span>
    </div>
  `,
  styles: [`
    .typing-message {
      padding: 0.5rem 1rem;
      color: #6c757d;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      margin-top: auto;
    }

    .typing-dots {
      &:after {
        content: '.';
        animation: dots 1.5s steps(5, end) infinite;
      }
    }

    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60% { content: '...'; }
      80%, 100% { content: ''; }
    }
  `]
})
export class TypingIndicatorComponent { }
