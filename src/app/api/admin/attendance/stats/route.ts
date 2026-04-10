import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAttendanceStats } from '@/lib/attendance/stats';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    const roleParam = searchParams.get('role');
    const isStaffView = roleParam === 'staff';
    const rolesToFetch = isStaffView ? ['madrich', 'mazkirut'] : ['participant'];

    if (!groupId) {
      return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const today = format(new Date(), 'yyyy-MM-dd');

    // Fetch sessions for this group. In the chanichim view (default) we
    // skip sessions with session_type='planning' since those are
    // madrich-only and shouldn't show chanichim columns. The staff view
    // keeps everything.
    let sessionsQuery = supabase
      .from('sessions')
      .select('id, session_date, is_cancelled, is_locked, is_locked_staff, session_type')
      .eq('group_id', groupId)
      .order('session_date', { ascending: true });
    if (!isStaffView) {
      sessionsQuery = sessionsQuery.neq('session_type', 'planning');
    }
    const { data: sessions, error: sessionsError } = await sessionsQuery;

    if (sessionsError) throw new Error(sessionsError.message);

    // Fetch members in this group — either participants, or madrichim/mazkirut
    // for the staff view. Either way we include inactive memberships so the
    // "dropout" behavior still works for participants (unused for staff).
    const { data: memberships, error: membersError } = await supabase
      .from('group_memberships')
      .select('profile_id, is_active, profiles(id, first_name, last_name, is_active, role)')
      .eq('group_id', groupId)
      .in('role', rolesToFetch);

    if (membersError) throw new Error(membersError.message);

    const participants = (memberships ?? [])
      .map((m) => {
        const p = m.profiles as unknown as { id: string; first_name: string; last_name: string; is_active: boolean; role: string } | null;
        if (!p) return null;
        return { ...p, isDropout: !m.is_active };
      })
      .filter((p): p is { id: string; first_name: string; last_name: string; is_active: boolean; role: string; isDropout: boolean } => p !== null);

    // Fetch all attendance records for these sessions
    const sessionIds = (sessions ?? []).map((s) => s.id);
    let records: { session_id: string; participant_id: string; status: string }[] = [];

    if (sessionIds.length > 0) {
      // Fetch ALL attendance records (Supabase default limit is 1000)
      // Paginate in chunks of session IDs to handle large datasets
      for (let i = 0; i < sessionIds.length; i += 20) {
        const chunk = sessionIds.slice(i, i + 20);
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('attendance_records')
          .select('session_id, participant_id, status')
          .in('session_id', chunk)
          .limit(10000);

        if (attendanceError) throw new Error(attendanceError.message);
        records.push(...(attendanceData ?? []));
      }
    }

    // Compute stats
    const participantStats = computeAttendanceStats(
      sessions ?? [],
      participants,
      records as { session_id: string; participant_id: string; status: 'present' | 'late' | 'absent' | 'excused' }[],
      today
    );

    // Sort by last name
    participantStats.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

    // Determine which sessions have at least 1 attendance record
    const sessionsWithRecords = new Set(records.map((r) => r.session_id));

    // Session info for grid headers — ALL sessions (past + future)
    const sessionHeaders = (sessions ?? [])
      .map((s) => ({
        id: s.id,
        date: s.session_date,
        isLocked: isStaffView ? s.is_locked_staff : s.is_locked,
        isCancelled: s.is_cancelled,
        hasAttendance: sessionsWithRecords.has(s.id),
        isFuture: s.session_date > today,
      }));

    // Fetch events for this group
    const { data: eventGroupLinks } = await supabase
      .from('event_groups')
      .select('event_id')
      .eq('group_id', groupId);

    const eventIds = (eventGroupLinks ?? []).map((eg) => eg.event_id);
    let eventHeaders: { id: string; name: string; date: string; hours: number }[] = [];
    let eventRecords: Record<string, Record<string, boolean>> = {}; // eventId → participantId → attended

    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from('events')
        .select('id, name, event_date, real_hours')
        .in('id', eventIds)
        .order('event_date', { ascending: true });

      eventHeaders = (events ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        date: e.event_date,
        hours: e.real_hours,
      }));

      // Fetch event attendance
      const { data: eventAttendance } = await supabase
        .from('event_attendance')
        .select('event_id, participant_id, attended')
        .in('event_id', eventIds);

      for (const ea of eventAttendance ?? []) {
        if (!eventRecords[ea.event_id]) eventRecords[ea.event_id] = {};
        eventRecords[ea.event_id][ea.participant_id] = ea.attended;
      }

      // Add event attendance to participant stats
      for (const ps of participantStats) {
        ps.eventRecords = {};
        for (const ev of eventHeaders) {
          ps.eventRecords[ev.id] = eventRecords[ev.id]?.[ps.id] ?? false;
        }
      }
    }

    return NextResponse.json({
      sessions: sessionHeaders,
      participants: participantStats,
      events: eventHeaders,
    });
  } catch (err) {
    console.error('Attendance stats error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
