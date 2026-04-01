export const BRAND = {
  navy: '#1B2A6B',
  coral: '#E85B81',
  lightBlue: '#D6EAF8',
  white: '#FFFFFF',
  darkText: '#1a1a2e',
  mutedText: '#6b7280',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

export const ROLES = ['admin', 'coordinator', 'madrich', 'participant', 'parent'] as const;
export type UserRole = typeof ROLES[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  coordinator: 'Coordinator',
  madrich: 'Madrich/a',
  participant: 'Participant',
  parent: 'Parent',
};

export const ROLE_ROUTES: Record<UserRole, string> = {
  admin: '/admin',
  coordinator: '/admin',
  madrich: '/madrich',
  participant: '/participant',
  parent: '/parent',
};

export const ATTENDANCE_STATUS = ['present', 'late', 'absent', 'excused'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUS[number];

export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  excused: '#6b7280',
};

export const GOAL_CATEGORIES = ['leadership', 'community', 'personal', 'academic'] as const;
export type GoalCategory = typeof GOAL_CATEGORIES[number];

export const HOUR_SOURCE_TYPES = ['attendance', 'event', 'volunteer', 'manual', 'goal_bonus'] as const;
export type HourSourceType = typeof HOUR_SOURCE_TYPES[number];
