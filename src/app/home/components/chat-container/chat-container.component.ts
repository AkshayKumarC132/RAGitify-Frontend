import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-chat-container',
  templateUrl: './chat-container.component.html',
  styleUrls: ['./chat-container.component.scss']
})
export class ChatContainerComponent implements AfterViewInit, OnChanges {
  @Input() messages: Message[] = [];
  @Input() currentRun: Run | null = null;

  @ViewChild('messagesList') messagesList?: ElementRef<HTMLDivElement>;

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages'] && this.shouldScrollToLatest(changes['messages'].previousValue, changes['messages'].currentValue)) {
      queueMicrotask(() => this.scrollToBottom());
    }
  }

  trackByMessage(index: number, message: Message): number {
    return message.id;
  }

  private shouldScrollToLatest(previous: Message[] | undefined, current: Message[] | undefined): boolean {
    if (!current?.length) return false;
    if (!previous) return true;
    const previousLastId = previous[previous.length - 1]?.id;
    const currentLastId = current[current.length - 1]?.id;
    return previous.length !== current.length || previousLastId !== currentLastId;
  }

  private scrollToBottom(): void {
    const container = this.messagesList?.nativeElement;
    if (!container) return;

    try {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } catch (err) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

