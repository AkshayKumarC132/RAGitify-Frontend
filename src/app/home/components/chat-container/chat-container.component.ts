import { Component, Input } from '@angular/core';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-chat-container',
  templateUrl: './chat-container.component.html',
  styleUrls: ['./chat-container.component.scss']
})
export class ChatContainerComponent {
  @Input() messages: Message[] = [];
  @Input() currentRun: Run | null = null;
}

