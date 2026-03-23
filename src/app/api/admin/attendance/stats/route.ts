import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAttendanceStats } from '@/lib/attendance/stats';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');

    if (!groupId) {
      return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const today = format(new Date(), 'yyyy-MM-dd');

    // Fetch sessions for this group
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, session_date, is_cancelled, is_locked')
      .eq('group_id', groupId)
      .order('session_date', { ascending: true });

    if (sessionsError) throw new Error(sessionsError.message);

    // Fetch participants in this group
    const { data: memberships, error: membersError } = await supabase
      .from('group_memberships')
      .select('profile_id, profiles(id, first_name, last_name)')
      .eq('group_id', groupId)
      .eq('role', 'participant')
      .eq('is_active', true);

    if (membersError) throw new Error(membersError.message);

    const participants = (memberships ?? [])
      .map((m) => m.profiles as unknown as { id: string; first_name: string; last_name: string } | null)
      .filter((p): p is { id: string; first_name: string; last_name: string } => p !== null);

    // Fetch all attendance records for these sessions
    const sessionIds = (sessions ?? []).map((s) => s.id);
    let records: { session_id: string; participant_id: string; status: string }[] = [];

    if (sessionIds.length > 0) {
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('session_id, participant_id, status')
        .in('session_id', sessionIds);

      if (attendanceError) throw new Error(attendanceError.message);
      records = attendanceData ?? [];
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

    // Session info for grid headers — past sessions (both active and cancelled)
    const sessionHeaders = (sessions ?? [])
      .filter((s) => s.session_date <= today)
      .map((s) => ({
        id: s.id,
        date: s.session_date,
        isLocked: s.is_locked,
        isCancelled: s.is_cancelled,
      }));

    return NextResponse.json({
      sessions: sessionHeaders,
      participants: participantStats,
    });
  } catch (err) {
    console.error('Attendance stats error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
