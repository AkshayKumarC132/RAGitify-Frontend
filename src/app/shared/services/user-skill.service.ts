import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { UserSkill } from '../models/user-skill.model';

export interface SkillConflict {
  do_line: string;
  dont_line: string;
  reason: string;
}

export interface SkillConflictResult {
  has_conflict: boolean;
  conflicts: SkillConflict[];
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class UserSkillService {
  constructor(private api: ApiService, private auth: AuthService) {}

  private getToken(): string {
    const token = this.auth.getToken();
    if (!token) {
      throw new Error('Authentication token is required');
    }
    return token;
  }

  getSkill(): Observable<UserSkill> {
    const token = this.getToken();
    return this.api.get<UserSkill>(`/skill/${token}/`, token);
  }

  /** Validate DO and DON'T instruction content for conflicts before saving. */
  validateSkillConflicts(doContent: string, dontContent: string): Observable<SkillConflictResult> {
    const token = this.getToken();
    return this.api.post<SkillConflictResult>(
      `/skill/validate/${token}/`,
      { do_content: doContent, dont_content: dontContent },
      token
    );
  }

  saveSkill(skill: Partial<UserSkill>): Observable<UserSkill> {
    const token = this.getToken();
    return this.api.put<UserSkill>(`/skill/${token}/`, skill, token);
  }



  updateSkillStatus(isActive: boolean): Observable<UserSkill> {
    const token = this.getToken();
    return this.api.patch<UserSkill>(`/skill/${token}/`, { is_active: isActive ? 1 : 0 }, token);
  }

  deleteSkill(): Observable<void> {
    const token = this.getToken();
    return this.api.delete<void>(`/skill/${token}/`, token);
  }
}

