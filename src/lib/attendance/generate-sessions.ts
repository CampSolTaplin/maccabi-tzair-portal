import { eachDayOfInterval, getDay, parseISO, format } from 'date-fns';

export type SessionType = 'regular' | 'planning';

export interface ScheduleRow {
  id: string;
  group_id: string;
  day_of_week: number;
  session_type?: SessionType;
}

export interface SessionInsert {
  group_id: string;
  schedule_id: string;
  session_date: string; // YYYY-MM-DD
  session_type: SessionType;
}

/**
 * Given a list of schedules and a date range, generate all session rows.
 * Each session inherits its `session_type` from the schedule that
 * produced it, defaulting to 'regular' for legacy schedules that
 * don't carry a session_type.
 *
 * Pure function — no DB access.
 */
export function generateSessionRows(
  schedules: ScheduleRow[],
  seasonStart: string,
  seasonEnd: string
): SessionInsert[] {
  const start = parseISO(seasonStart);
  const end = parseISO(seasonEnd);

  if (start > end) return [];

  const allDays = eachDayOfInterval({ start, end });
  const sessions: SessionInsert[] = [];

  for (const schedule of schedules) {
    for (const day of allDays) {
      if (getDay(day) === schedule.day_of_week) {
        sessions.push({
          group_id: schedule.group_id,
          schedule_id: schedule.id,
          session_date: format(day, 'yyyy-MM-dd'),
          session_type: schedule.session_type ?? 'regular',
        });
      }
    }
  }

  return sessions;
}
