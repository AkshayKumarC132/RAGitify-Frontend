import { Component } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss']
})
export class EmptyStateComponent {
  suggestions = [
    "Show me a code snippet of a website's sticky header",
    "Tell me a fun fact about the Roman Empire",
    "Explain options trading if I'm familiar with buying and selling stocks"
  ];
}

