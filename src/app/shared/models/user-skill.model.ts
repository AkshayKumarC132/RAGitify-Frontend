export interface UserSkill {
  id?: number;
  name: string;
  do_content: string;
  dont_content: string;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
}
