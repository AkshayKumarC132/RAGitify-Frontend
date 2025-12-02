import { Component, Input, OnInit } from '@angular/core';
import { Message } from '../../../shared/models/message.model';

@Component({
  selector: 'app-message-bubble',
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss']
})
export class MessageBubbleComponent implements OnInit {
  @Input() message!: Message;
  @Input() isLast: boolean = false;

  displayContent: string = '';
  private typingSpeed = 5; // ms per character
  // Track messages that have already played the typing animation in this session
  private static animatedMessageIds = new Set<number>();

  ngOnInit() {
    if (this.shouldAnimate()) {
      MessageBubbleComponent.animatedMessageIds.add(this.message.id);
      this.typeWriter(this.message.content);
    } else {
      this.displayContent = this.message.content;
      // Mark as animated so it won't animate in future navigations
      MessageBubbleComponent.animatedMessageIds.add(this.message.id);
    }
  }

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private shouldAnimate(): boolean {
    const alreadyAnimated = MessageBubbleComponent.animatedMessageIds.has(this.message.id);

    return !this.isUser &&
      this.isLast &&
      this.isRecent() &&
      !alreadyAnimated;
  }

  private isRecent(): boolean {
    const messageTime = new Date(this.message.created_at).getTime();
    const now = new Date().getTime();
    return (now - messageTime) < 60000; // Less than 1 minute old
  }

  private typeWriter(text: string, index: number = 0) {
    if (index < text.length) {
      this.displayContent += text.charAt(index);
      setTimeout(() => {
        this.typeWriter(text, index + 1);
      }, this.typingSpeed);
    }
  }
}
