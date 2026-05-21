import { Component, Input, Output, EventEmitter, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  itemName?: string;
  secondaryMessage?: string;
  type?: 'danger' | 'info' | 'warning';
  confirmText?: string;
  cancelText?: string;
  isPrompt?: boolean;
  promptValue?: string;
  promptPlaceholder?: string;
  hideCancel?: boolean;
}


@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() data: ConfirmDialogOptions = {
    title: '',
    message: '',
    type: 'danger'
  };
  @Output() confirmed = new EventEmitter<boolean | string>();
  @ViewChild('dialogElement') dialogElement!: ElementRef<HTMLDivElement>;
  @ViewChild('promptInput') promptInputRef?: ElementRef<HTMLInputElement>;

  promptValue: string = '';

  ngOnInit(): void {
    // Prevent body scroll when dialog is open
    document.body.style.overflow = 'hidden';
    if (this.data.isPrompt) {
      this.promptValue = this.data.promptValue || '';
    }
  }

  ngAfterViewInit(): void {
    // Focus the dialog or input on open for accessibility
    setTimeout(() => {
      if (this.data.isPrompt && this.promptInputRef?.nativeElement) {
        this.promptInputRef.nativeElement.focus();
        this.promptInputRef.nativeElement.select();
      } else if (this.dialogElement?.nativeElement) {
        this.dialogElement.nativeElement.focus();
      }
    }, 0);
  }

  ngOnDestroy(): void {
    // Restore body scroll when dialog is closed
    document.body.style.overflow = '';
  }

  @HostListener('keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.onCancel();
  }

  @HostListener('keydown.enter', ['$event'])
  onEnterKey(event: KeyboardEvent): void {
    // Only confirm on Enter if focus is on the dialog itself, not on input fields
    if (event.target === event.currentTarget || (event.target as HTMLElement).tagName === 'BUTTON') {
      event.preventDefault();
      this.onConfirm();
    }
  }

  onConfirm(): void {
    if (this.data.isPrompt) {
      this.confirmed.emit(this.promptValue);
    } else {
      this.confirmed.emit(true);
    }
  }

  onCancel(): void {
    this.confirmed.emit(false);
  }

  onBackdropClick(event: MouseEvent): void {
    // Only close if clicking directly on the backdrop, not on the dialog
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.onCancel();
    }
  }
}

