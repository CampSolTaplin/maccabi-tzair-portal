type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

interface SessionData {
  id: string;
  session_date: string;
  is_cancelled: boolean;
  is_locked: boolean;
}

interface AttendanceRecord {
  session_id: string;
  participant_id: string;
  status: AttendanceStatus;
}

interface ParticipantProfile {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ParticipantStats {
  id: string;
  firstName: string;
  lastName: string;
  stats: {
    present: number;
    late: number;
    excused: number;
    total: number;
    percentage: number;
  };
  consecutiveAbsences: number;
  records: Record<string, AttendanceStatus | null>;
}

/**
 * Compute attendance stats for a set of participants across sessions.
 *
 * Key logic:
 * - No record = absent (implicit)
 * - Percentage = PRESENT / (sessions where attendance was taken for the group)
 * - "Attendance was taken" = session has at least 1 record from any participant
 * - Excused sessions don't count against the participant
 *
 * Pure function — no DB access.
 */
export function computeAttendanceStats(
  sessions: SessionData[],
  participants: ParticipantProfile[],
  records: AttendanceRecord[],
  today: string
): ParticipantStats[] {
  // Only count past, non-cancelled sessions
  const eligibleSessions = sessions
    .filter((s) => !s.is_cancelled && s.session_date <= today)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  const eligibleSessionIds = new Set(eligibleSessions.map((s) => s.id));

  // Build lookup: participantId -> sessionId -> status
  const recordMap = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of records) {
    if (!eligibleSessionIds.has(r.session_id)) continue;
    if (!recordMap.has(r.participant_id)) recordMap.set(r.participant_id, new Map());
    recordMap.get(r.participant_id)!.set(r.session_id, r.status);
  }

  // Determine which sessions had attendance taken (at least 1 record)
  const sessionsWithAttendance = new Set<string>();
  for (const r of records) {
    if (eligibleSessionIds.has(r.session_id)) {
      sessionsWithAttendance.add(r.session_id);
    }
  }

  return participants.map((p) => {
    const pRecords = recordMap.get(p.id) ?? new Map<string, AttendanceStatus>();

    let present = 0, late = 0, excused = 0;

    // Build records map for grid (all sessions)
    const allRecords: Record<string, AttendanceStatus | null> = {};
    for (const s of sessions) {
      const rec = records.find((r) => r.session_id === s.id && r.participant_id === p.id);
      allRecords[s.id] = rec?.status ?? null;
    }

    // Count stats only from sessions where attendance was taken (group-wide)
    let countableSessions = 0;
    for (const s of eligibleSessions) {
      if (!sessionsWithAttendance.has(s.id)) continue; // skip sessions with no attendance taken

      const status = pRecords.get(s.id);
      if (status === 'excused') {
        excused++;
        continue; // excused doesn't count in denominator
      }

      countableSessions++;
      if (status === 'present') present++;
      else if (status === 'late') late++;
      // No record or any other status = absent (implicit), counted in denominator but not numerator
    }

    const total = countableSessions + excused;
    const percentage = countableSessions > 0 ? Math.round((present / countableSessions) * 100) : 0;

    // Consecutive absences: walk backwards through sessions that had attendance taken
    let consecutiveAbsences = 0;
    for (let i = eligibleSessions.length - 1; i >= 0; i--) {
      const sid = eligibleSessions[i].id;
      if (!sessionsWithAttendance.has(sid)) continue;
      const status = pRecords.get(sid);
      if (!status || status === 'absent') {
        // No record = absent (implicit)
        consecutiveAbsences++;
      } else {
        break;
      }
    }

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      stats: { present, late, excused, total, percentage },
      consecutiveAbsences,
      records: allRecords,
    };
  });
}
