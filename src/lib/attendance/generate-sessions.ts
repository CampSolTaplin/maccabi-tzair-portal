import { eachDayOfInterval, getDay, parseISO, format } from 'date-fns';

export interface ScheduleRow {
  id: string;
  group_id: string;
  day_of_week: number;
}

export interface SessionInsert {
  group_id: string;
  schedule_id: string;
  session_date: string; // YYYY-MM-DD
  session_type: 'regular';
}

/**
 * Given a list of schedules and a date range, generate all session rows.
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
          session_type: 'regular',
        });
      }
    }
  }

  return sessions;
}
