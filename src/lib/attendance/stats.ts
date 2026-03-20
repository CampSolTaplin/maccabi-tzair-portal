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
    absent: number;
    excused: number;
    total: number;
    percentage: number;
  };
  consecutiveAbsences: number;
  records: Record<string, AttendanceStatus | null>;
}

/**
 * Compute attendance stats for a set of participants across sessions.
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

  return participants.map((p) => {
    const pRecords = recordMap.get(p.id) ?? new Map<string, AttendanceStatus>();

    let present = 0, late = 0, absent = 0, excused = 0;

    // Build records map for grid (including all sessions, not just eligible)
    const allRecords: Record<string, AttendanceStatus | null> = {};
    for (const s of sessions) {
      const rec = records.find((r) => r.session_id === s.id && r.participant_id === p.id);
      allRecords[s.id] = rec?.status ?? null;
    }

    // Count stats only from eligible sessions
    for (const s of eligibleSessions) {
      const status = pRecords.get(s.id);
      if (!status) {
        // No record = absent (unmarked)
        absent++;
      } else {
        switch (status) {
          case 'present': present++; break;
          case 'late': late++; break;
          case 'absent': absent++; break;
          case 'excused': excused++; break;
        }
      }
    }

    const total = eligibleSessions.length;
    const denominator = total - excused;
    const percentage = denominator > 0 ? Math.round(((present + late) / denominator) * 100) : 0;

    // Consecutive absences: walk backwards through eligible sessions
    let consecutiveAbsences = 0;
    for (let i = eligibleSessions.length - 1; i >= 0; i--) {
      const status = pRecords.get(eligibleSessions[i].id);
      if (status === 'absent' || (!status && eligibleSessionIds.has(eligibleSessions[i].id))) {
        consecutiveAbsences++;
      } else {
        break;
      }
    }

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      stats: { present, late, absent, excused, total, percentage },
      consecutiveAbsences,
      records: allRecords,
    };
  });
}
