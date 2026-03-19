import type { UserRole, AttendanceStatus, GoalCategory, HourSourceType } from '@/lib/utils/constants';

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  salesforce_contact_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  area: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface GroupMembership {
  id: string;
  profile_id: string;
  group_id: string;
  role: 'participant' | 'madrich' | 'admin';
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
}

export interface Schedule {
  id: string;
  group_id: string;
  name: string;
  day_of_week: number; // 0-6, 0=Sunday
  start_time: string | null;
  duration_minutes: number;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Session {
  id: string;
  group_id: string;
  schedule_id: string | null;
  session_date: string;
  session_type: 'regular' | 'event' | 'makeup' | 'special';
  title: string | null;
  is_cancelled: boolean;
  is_locked: boolean;
  hours_present: number;
  hours_late: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  participant_id: string;
  status: AttendanceStatus;
  marked_by: string | null;
  marked_at: string;
  notes: string | null;
}

export interface CommunityHourEntry {
  id: string;
  participant_id: string;
  source_type: HourSourceType;
  source_id: string | null;
  hours: number;
  description: string | null;
  earned_date: string;
  approved: boolean;
  approved_by: string | null;
  created_at: string;
}

export interface CommunityEvent {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  real_hours: number;
  multiplier: number;
  created_by: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  participant_id: string;
  title: string;
  description: string | null;
  category: GoalCategory | null;
  target_value: number | null;
  target_unit: string | null;
  status: 'active' | 'completed' | 'abandoned';
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GoalUpdate {
  id: string;
  goal_id: string;
  progress_value: number | null;
  note: string;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  email_sent: boolean;
  created_at: string;
}

export interface ParentChild {
  id: string;
  parent_id: string;
  child_id: string;
  relationship: string;
}
