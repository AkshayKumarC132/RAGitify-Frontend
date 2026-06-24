import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserSkillService, SkillConflict } from '../../../shared/services/user-skill.service';
import { catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-skills-section',
  templateUrl: './skills-section.component.html',
  styleUrls: ['./skills-section.component.scss']
})
export class SkillsSectionComponent implements OnInit {
  skillForm: FormGroup;
  isLoading = true;
  isSaving = false;
  isValidating = false;
  hasExistingSkill = false;
  skillId?: number;

  constructor(
    private fb: FormBuilder,
    private skillService: UserSkillService
  ) {
    this.skillForm = this.fb.group({
      name: ['', Validators.required],
      dos: [''],
      donts: [''],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadSkill();
  }

  loadSkill(): void {
    this.isLoading = true;
    this.skillService.getSkill().pipe(
      catchError((err) => {
        if (err.status === 404) {
          // No skill exists yet
          this.hasExistingSkill = false;
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load skill' });
        }
        return of(null);
      }),
      finalize(() => this.isLoading = false)
    ).subscribe((skill) => {
      if (skill) {
        this.hasExistingSkill = true;
        this.skillId = skill.id;
        this.skillForm.patchValue({
          name: skill.name,
          dos: skill.do_content || '',
          donts: skill.dont_content || '',
          is_active: !!skill.is_active
        });
      }
    });
  }

  toggleStatus(event: Event): void {
    if (!this.hasExistingSkill) {
      return; // If skill is not created yet, just change local form state
    }

    const isActive = (event.target as HTMLInputElement).checked;

    this.skillService.updateSkillStatus(isActive).subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: isActive ? 'Skill Activated' : 'Skill Deactivated',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      },
      error: () => {
        // Revert toggle
        this.skillForm.patchValue({ is_active: !isActive }, { emitEvent: false });
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update skill status' });
      }
    });
  }

  saveSkill(): void {
    if (this.skillForm.invalid) {
      Swal.fire({ icon: 'warning', title: 'Invalid Form', text: 'Please fill out all required fields' });
      return;
    }

    const doContent = (this.skillForm.value.dos || '').trim();
    const dontContent = (this.skillForm.value.donts || '').trim();

    const payload = {
      name: this.skillForm.value.name,
      do_content: doContent,
      dont_content: dontContent,
      is_active: this.skillForm.value.is_active ? 1 : 0
    };

    // If both DO'S and DON'TS are present, validate first
    if (doContent && dontContent) {
      this.isValidating = true;
      this.skillService.validateSkillConflicts(doContent, dontContent).pipe(
        finalize(() => this.isValidating = false)
      ).subscribe({
        next: (result) => {
          if (result.error) {
            // Validation system itself failed - block save
            Swal.fire({
              icon: 'error',
              title: 'Validation Failed',
              text: result.error,
            });
            return;
          }

          if (result.has_conflict && result.conflicts.length > 0) {
            // Show conflicts and let user choose
            this.showConflictDialog(result.conflicts);
          } else {
            // No conflicts - proceed with save
            this.executeSave(payload);
          }
        },
        error: (err) => {
          // Network or server error - block save
          const errorMsg = err?.error?.error || err?.error?.detail || 'Conflict validation failed. Please try again.';
          Swal.fire({
            icon: 'error',
            title: 'Validation Error',
            text: errorMsg,
          });
        }
      });
    } else {
      // Only one section or both empty - no conflict possible, save directly
      this.executeSave(payload);
    }
  }

  private showConflictDialog(conflicts: SkillConflict[]): void {
    const conflictItems = conflicts.map((c) => `
      <div style="background: var(--bg-secondary, #f8f9fa); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; text-align: left;">
        <div style="display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.4rem;">
          <span style="background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap;">DO</span>
          <span style="font-size: 13px;">${this.escapeHtml(c.do_line)}</span>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.4rem;">
          <span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap;">DON'T</span>
          <span style="font-size: 13px;">${this.escapeHtml(c.dont_line)}</span>
        </div>
        <div style="font-size: 12px; color: #6b7280; font-style: italic; padding-left: 0.25rem;">
          ${this.escapeHtml(c.reason)}
        </div>
      </div>
    `).join('');

    Swal.fire({
      icon: 'warning',
      title: 'Conflicts Detected',
      html: `
        <p style="margin-bottom: 0.75rem; font-size: 14px; color: #374151;">
          We found <strong>${conflicts.length}</strong> potential conflict${conflicts.length > 1 ? 's' : ''} between your <strong style="color: #16a34a;">DO'S</strong> and <strong style="color: #dc2626;">DON'TS</strong>:
        </p>
        <div style="max-height: 300px; overflow-y: auto; margin-bottom: 0.75rem;">
          ${conflictItems}
        </div>
        <p style="font-size: 12px; color: #6b7280;">
          Please go back and resolve these conflicts before saving.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Go Back & Fix',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3b82f6',
      width: '550px',
    }).then(() => {
      // Keep user on form to make fixes.
    });
  }

  private executeSave(payload: any): void {
    this.isSaving = true;
    this.skillService.saveSkill(payload).pipe(
      finalize(() => this.isSaving = false)
    ).subscribe({
      next: (savedSkill) => {
        Swal.fire({ icon: 'success', title: 'Saved', text: 'Skill saved successfully', timer: 1500, showConfirmButton: false });
        this.hasExistingSkill = true;
        this.skillId = savedSkill.id;
      },
      error: (err) => {
        // Handle conflict response from PUT (in case validate was skipped)
        if (err?.status === 409 && err?.error?.has_conflict) {
          this.showConflictDialog(err.error.conflicts || []);
          return;
        }
        if (err?.status === 422 && err?.error?.error) {
          Swal.fire({ icon: 'error', title: 'Validation Failed', text: err.error.error });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save skill' });
      }
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  discard(): void {
    if (this.hasExistingSkill) {
      this.loadSkill();
    } else {
      this.skillForm.reset({ name: '', dos: '', donts: '', is_active: true });
    }
  }
}
