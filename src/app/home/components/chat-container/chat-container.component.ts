import { Component, Input, OnChanges, SimpleChanges, AfterViewInit, ElementRef, ViewChild, OnDestroy, Output, EventEmitter } from '@angular/core';
import { Message } from '../../../shared/models/message.model';
import { Run } from '../../../shared/models/run.model';

@Component({
  selector: 'app-chat-container',
  templateUrl: './chat-container.component.html',
  styleUrls: ['./chat-container.component.scss']
})
export class ChatContainerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() messages: Message[] = [];
  @Input() currentRun: Run | null = null;
  @Input() runMap: Record<number, Run> = {};
  @Input() rerunLoadingMessageId: number | null = null;
  @Output() rerunRequest = new EventEmitter<{ message: Message, run: Run }>();

  @ViewChild('messagesWrapper') private messagesWrapper?: ElementRef<HTMLDivElement>;
  @ViewChild('messagesList') private messagesList?: ElementRef<HTMLDivElement>;

  private scrollTimer?: ReturnType<typeof setTimeout>;
  private isAutoScrolling = false;
  showJumpToBottom = false;
  private readonly scrollThreshold = 140;
  // Map of source message ID to array of assistant messages (reruns)
  private rerunGroups: Map<number, Message[]> = new Map();
  // Map of assistant message ID to its source message ID
  private messageToSourceMap: Map<number, number> = new Map();
  // Map of source message ID to the currently active index in that rerun group
  private activeRerunIndices: Map<number, number> = new Map();
  pagedMessages: Message[] = [];

  ngAfterViewInit(): void {
    this.queueScrollToBottom();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages'] || changes['runMap']) {
      this.rebuildAssistantPaging();
      this.queueScrollToBottom();
    }
    if (changes['currentRun']) {
      const status = changes['currentRun'].currentValue?.status;
      if (status === 'in_progress' || status === 'queued') {
        this.queueScrollToBottom();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
  }

  private queueScrollToBottom(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.isAutoScrolling = true;
    this.scrollTimer = setTimeout(() => this.performScrollToBottom(), 0);
  }

  onScroll(): void {
    if (this.isAutoScrolling) {
      return;
    }
    const container = this.messagesWrapper?.nativeElement;
    if (!container) {
      return;
    }
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    this.showJumpToBottom = distanceFromBottom > this.scrollThreshold;
  }

  jumpToBottom(): void {
    this.isAutoScrolling = true;
    this.performScrollToBottom();
  }

  private performScrollToBottom(): void {
    if (!this.messagesWrapper?.nativeElement) {
      this.isAutoScrolling = false;
      return;
    }
    const container = this.messagesWrapper.nativeElement;
    container.scrollTop = container.scrollHeight;
    this.showJumpToBottom = false;
    this.isAutoScrolling = false;
  }

  trackByMessage(index: number, message: Message): number | string {
    // For placeholder messages, use a combination of index and role to ensure uniqueness
    if (message.id < 0) {
      return `placeholder-${index}-${message.role}`;
    }
    return message.id;
  }

  onRerun(message: Message): void {
    let run = this.getRunForMessage(message);
    
    // For placeholder messages, get the run from the previous user message
    if (!run && message.id < 0 && message.role === 'assistant') {
      const userMessage = this.messages[this.messages.length - 1];
      if (userMessage && userMessage.role === 'user') {
        run = this.runMap?.[userMessage.id];
        // Use the user message for rerun instead of the placeholder
        if (run) {
          this.rerunRequest.emit({ message: userMessage, run });
          return;
        }
      }
    }
    
    if (run) {
      this.rerunRequest.emit({ message, run });
    }
  }

  onPagerPrevForMessage(message: Message): void {
    if (message.role !== 'assistant') {
      return;
    }
    const sourceMessageId = this.messageToSourceMap.get(message.id);
    if (sourceMessageId === undefined) {
      return;
    }
    const currentIndex = this.activeRerunIndices.get(sourceMessageId) || 0;
    if (currentIndex > 0) {
      this.activeRerunIndices.set(sourceMessageId, currentIndex - 1);
      this.updatePagedMessages();
      this.queueScrollToBottom();
    }
  }

  onPagerNextForMessage(message: Message): void {
    if (message.role !== 'assistant') {
      return;
    }
    const sourceMessageId = this.messageToSourceMap.get(message.id);
    if (sourceMessageId === undefined) {
      return;
    }
    const group = this.rerunGroups.get(sourceMessageId) || [];
    const currentIndex = this.activeRerunIndices.get(sourceMessageId) || 0;
    if (currentIndex < group.length - 1) {
      this.activeRerunIndices.set(sourceMessageId, currentIndex + 1);
      this.updatePagedMessages();
      this.queueScrollToBottom();
    }
  }

  private rebuildAssistantPaging(): void {
    // Store previous group sizes before clearing
    const previousGroupSizes = new Map<number, number>();
    this.rerunGroups.forEach((group, sourceId) => {
      previousGroupSizes.set(sourceId, group.length);
    });

    // Clear previous mappings
    this.rerunGroups.clear();
    this.messageToSourceMap.clear();

    // Group assistant messages by their source user message ID
    const assistantMessages = this.messages.filter(m => m.role === 'assistant');
    
    for (const assistantMsg of assistantMessages) {
      const sourceMessageId = this.getSourceMessageIdForAssistant(assistantMsg);
      if (sourceMessageId !== undefined) {
        // Add to rerun group
        if (!this.rerunGroups.has(sourceMessageId)) {
          this.rerunGroups.set(sourceMessageId, []);
        }
        this.rerunGroups.get(sourceMessageId)!.push(assistantMsg);
        this.messageToSourceMap.set(assistantMsg.id, sourceMessageId);
      }
    }

    // Sort each rerun group by creation time (oldest first)
    this.rerunGroups.forEach((group, sourceId) => {
      group.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
      });
      
      const previousSize = previousGroupSizes.get(sourceId) || 0;
      
      // If the group has grown (new rerun added), automatically show the newest message
      if (group.length > previousSize) {
        this.activeRerunIndices.set(sourceId, group.length - 1);
      } else if (!this.activeRerunIndices.has(sourceId)) {
        // Initialize active index to the last message in the group (most recent)
        this.activeRerunIndices.set(sourceId, group.length - 1);
      } else {
        // Ensure the index is valid
        const currentIndex = this.activeRerunIndices.get(sourceId)!;
        if (currentIndex >= group.length) {
          this.activeRerunIndices.set(sourceId, group.length - 1);
        }
      }
    });

    this.updatePagedMessages();
  }

  private updatePagedMessages(): void {
    // Check if we need to show an empty assistant message for a cancelled run
    const assistantMessages = this.messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) {
      const messagesWithPlaceholder = this.addPlaceholderForCancelledRun();
      this.pagedMessages = messagesWithPlaceholder;
      return;
    }

    // Build a map of which assistant message to show for each source message ID
    const assistantMessageToShow = new Map<number, Message>();
    
    this.rerunGroups.forEach((group, sourceId) => {
      const activeIndex = this.activeRerunIndices.get(sourceId) ?? (group.length - 1);
      if (activeIndex >= 0 && activeIndex < group.length) {
        const messageToShow = group[activeIndex];
        assistantMessageToShow.set(messageToShow.id, messageToShow);
      }
    });

    // Show all non-assistant messages and only the active assistant messages from each rerun group
    this.pagedMessages = this.messages.filter(m => {
      if (m.role !== 'assistant') {
        return true;
      }
      // Only show this assistant message if it's the active one in its rerun group
      return assistantMessageToShow.has(m.id);
    });
  }

  getAssistantMessagesForPaging(message: Message): Message[] {
    if (message.role !== 'assistant') {
      return [];
    }
    const sourceMessageId = this.messageToSourceMap.get(message.id);
    if (sourceMessageId === undefined) {
      return [];
    }
    return this.rerunGroups.get(sourceMessageId) || [];
  }

  getActiveRerunIndex(message: Message): number {
    if (message.role !== 'assistant') {
      return 0;
    }
    const sourceMessageId = this.messageToSourceMap.get(message.id);
    if (sourceMessageId === undefined) {
      return 0;
    }
    // Return the active index for this rerun group
    return this.activeRerunIndices.get(sourceMessageId) ?? 0;
  }

  private getSourceMessageIdForAssistant(assistantMessage: Message): number | undefined {
    // First, try to get source_message_id from the run associated with this assistant message
    const run = this.getRunForAssistantMessage(assistantMessage);
    if (run?.source_message_id) {
      return run.source_message_id;
    }

    // Fallback: find the previous user message in the messages array
    const messageIndex = this.messages.findIndex(m => m.id === assistantMessage.id);
    if (messageIndex === -1) {
      return undefined;
    }

    for (let i = messageIndex - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i].id;
      }
    }

    return undefined;
  }

  private getRunForAssistantMessage(assistantMessage: Message): Run | undefined {
    // Find the run that produced this assistant message
    // The run's message_id should match the assistant message id
    for (const run of Object.values(this.runMap)) {
      if (run.message_id === assistantMessage.id) {
        return run;
      }
    }
    return undefined;
  }

  private addPlaceholderForCancelledRun(): Message[] {
    if (!this.messages.length) {
      return [];
    }

    const lastMessage = this.messages[this.messages.length - 1];
    
    // If the last message is a user message, check if it has a cancelled run
    if (lastMessage.role === 'user') {
      const run = this.getRunForMessage(lastMessage);
      if (run && run.status === 'cancelled') {
        // Check if there's already an assistant message after this user message
        const hasAssistantAfter = this.messages.some((m, index) => 
          index > this.messages.indexOf(lastMessage) && m.role === 'assistant'
        );
        
        if (!hasAssistantAfter) {
          // Create a placeholder empty assistant message
          const placeholderMessage: Message = {
            id: -1, // Use negative ID to indicate it's a placeholder
            thread_id: lastMessage.thread_id,
            user: '',
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString()
          };
          return [...this.messages, placeholderMessage];
        }
      }
    }

    return [...this.messages];
  }

  getRunForMessage(message: Message): Run | undefined {
    const sourceMessageId = this.getSourceMessageId(message);
    if (!sourceMessageId) {
      return undefined;
    }
    const run = this.runMap?.[sourceMessageId];
    
    // For placeholder messages (negative ID), get the run from the previous user message
    if (message.id < 0 && message.role === 'assistant') {
      const userMessage = this.messages[this.messages.length - 1];
      if (userMessage && userMessage.role === 'user') {
        return this.runMap?.[userMessage.id];
      }
    }
    
    return run;
  }

  private getSourceMessageId(message: Message): number | undefined {
    if (message.role !== 'assistant') {
      return message.id;
    }

    const messageIndex = this.messages.findIndex(m => m.id === message.id);
    if (messageIndex === -1) {
      return undefined;
    }

    for (let i = messageIndex - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i].id;
      }
    }

    return undefined;
  }
}