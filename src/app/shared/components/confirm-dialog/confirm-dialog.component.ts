import { Component, Input, Output, EventEmitter, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  itemName: string;
  secondaryMessage?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss']
})
export class ConfirmDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() title: string = '';
  @Input() message: string = '';
  @Input() itemName: string = '';
  @Input() secondaryMessage: string = '';
  @Output() confirmed = new EventEmitter<boolean>();
  @ViewChild('dialogElement') dialogElement!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    // Prevent body scroll when dialog is open
    document.body.style.overflow = 'hidden';
  }

  ngAfterViewInit(): void {
    // Focus the dialog on open for accessibility
    setTimeout(() => {
      if (this.dialogElement?.nativeElement) {
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
    this.confirmed.emit(true);
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

