import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';

@Component({
    selector: 'app-typing-label',
    template: `<span>{{ displayedText }}</span><span class="cursor" *ngIf="isTyping">|</span>`,
    styles: [`
    .cursor {
      display: inline-block;
      width: 2px;
      animation: blink 1s step-end infinite;
      margin-left: 2px;
      color: currentColor;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `]
})
export class TypingLabelComponent implements OnChanges, OnDestroy {
    @Input() text = '';
    displayedText = '';
    isTyping = false;
    private typingInterval: any;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['text']) {
            const current = changes['text'].currentValue;
            const previous = changes['text'].previousValue;

            // If it's the first load, or if the text hasn't meaningfully changed, just show it.
            // We specifically want to animate when "New Conversation" changes to something else,
            // or when the title is updated.
            if (changes['text'].isFirstChange()) {
                this.displayedText = current;
            } else if (current !== previous) {
                this.startTyping(current);
            }
        }
    }

    private startTyping(fullText: string): void {
        this.stopTyping();
        this.isTyping = true;
        this.displayedText = '';
        let index = 0;

        this.typingInterval = setInterval(() => {
            if (index < fullText.length) {
                this.displayedText += fullText.charAt(index);
                index++;
            } else {
                this.stopTyping();
            }
        }, 30); // Typing speed
    }

    private stopTyping(): void {
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        this.isTyping = false;
        // Ensure full text is shown if we stopped early or finished
        this.displayedText = this.text;
    }

    ngOnDestroy(): void {
        this.stopTyping();
    }
}
