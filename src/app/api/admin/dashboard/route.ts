import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // ── 1. Summary Stats ──

    // Total active participants
    const { count: totalParticipants } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('role', 'participant');

    // Total active madrichim
    const { count: totalMadrichim } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('role', 'madrich');

    // Total active groups
    const { count: totalGroups } = await supabase
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Total non-cancelled sessions
    const { count: totalSessions } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('is_cancelled', false);

    // Overall attendance percentage
    const { count: totalRecords } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true });

    const { count: presentRecords } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .in('status', ['present', 'late']);

    const overallAttendance =
      totalRecords && totalRecords > 0
        ? Math.round(((presentRecords ?? 0) / totalRecords) * 100)
        : 0;

    // ── 2. Upcoming Birthdays (next 30 days) ──

    const { data: profilesWithBirthdays } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, birthdate, role, is_active')
      .eq('is_active', true)
      .not('birthdate', 'is', null);

    const upcomingBirthdays: {
      firstName: string;
      lastName: string;
      birthdate: string;
      role: string;
      daysUntil: number;
      age: number;
      groupName: string | null;
    }[] = [];

    if (profilesWithBirthdays) {
      const profileIds = profilesWithBirthdays.map((p) => p.id);

      // Fetch primary group memberships for birthday profiles
      let membershipMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        // Paginate to avoid 1000-row limit
        for (let i = 0; i < profileIds.length; i += 50) {
          const chunk = profileIds.slice(i, i + 50);
          const { data: memberships } = await supabase
            .from('group_memberships')
            .select('profile_id, group_id, groups(name)')
            .in('profile_id', chunk)
            .eq('is_active', true);

          for (const m of memberships ?? []) {
            if (!membershipMap[m.profile_id]) {
              const g = m.groups as unknown as { name: string } | null;
              membershipMap[m.profile_id] = g?.name ?? '';
            }
          }
        }
      }

      for (const p of profilesWithBirthdays) {
        if (!p.birthdate) continue;
        const bd = new Date(p.birthdate + 'T00:00:00');
        const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
        let daysUntil = Math.floor(
          (thisYearBd.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        // If birthday already passed this year, check next year
        if (daysUntil < 0) {
          const nextYearBd = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
          daysUntil = Math.floor(
            (nextYearBd.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
              (1000 * 60 * 60 * 24)
          );
        }

        if (daysUntil <= 30) {
          const age =
            today.getFullYear() -
            bd.getFullYear() +
            (daysUntil === 0 ? 0 : daysUntil <= 30 ? 1 : 0);
          // More accurate age calculation
          const turningAge = today.getFullYear() - bd.getFullYear() + (daysUntil > 0 ? 1 : 0);

          upcomingBirthdays.push({
            firstName: p.first_name,
            lastName: p.last_name,
            birthdate: p.birthdate,
            role: p.role,
            daysUntil,
            age: turningAge,
            groupName: membershipMap[p.id] ?? null,
          });
        }
      }

      upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
    }

    // ── 3. Attendance by Group ──

    const { data: activeGroups } = await supabase
      .from('groups')
      .select('id, name, slug, area')
      .eq('is_active', true)
      .order('sort_order');

    const attendanceByGroup: {
      groupName: string;
      groupSlug: string;
      area: string | null;
      avgPercentage: number;
      participantCount: number;
    }[] = [];

    if (activeGroups) {
      for (const group of activeGroups) {
        // Count active participants in group
        const { count: participantCount } = await supabase
          .from('group_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .eq('role', 'participant')
          .eq('is_active', true);

        // Get non-cancelled sessions for this group
        const { data: groupSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('group_id', group.id)
          .eq('is_cancelled', false)
          .lte('session_date', todayStr);

        const sessionIds = (groupSessions ?? []).map((s) => s.id);

        let groupTotal = 0;
        let groupPresent = 0;

        if (sessionIds.length > 0) {
          for (let i = 0; i < sessionIds.length; i += 20) {
            const chunk = sessionIds.slice(i, i + 20);

            const { count: chunkTotal } = await supabase
              .from('attendance_records')
              .select('id', { count: 'exact', head: true })
              .in('session_id', chunk);

            const { count: chunkPresent } = await supabase
              .from('attendance_records')
              .select('id', { count: 'exact', head: true })
              .in('session_id', chunk)
              .in('status', ['present', 'late']);

            groupTotal += chunkTotal ?? 0;
            groupPresent += chunkPresent ?? 0;
          }
        }

        const avgPercentage = groupTotal > 0 ? Math.round((groupPresent / groupTotal) * 100) : 0;

        attendanceByGroup.push({
          groupName: group.name,
          groupSlug: group.slug,
          area: group.area,
          avgPercentage,
          participantCount: participantCount ?? 0,
        });
      }
    }

    // Sort by percentage descending
    attendanceByGroup.sort((a, b) => b.avgPercentage - a.avgPercentage);

    // ── 4. Recent Activity ──

    // Get sessions that have at least 1 attendance record, ordered by date desc
    const { data: recentSessions } = await supabase
      .from('attendance_records')
      .select('session_id')
      .limit(1000);

    const sessionIdsWithAttendance = [...new Set((recentSessions ?? []).map((r) => r.session_id))];

    const recentActivity: {
      groupName: string;
      sessionDate: string;
      attendanceCount: number;
    }[] = [];

    if (sessionIdsWithAttendance.length > 0) {
      // Fetch sessions with their group info
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, session_date, group_id, groups(name)')
        .in('id', sessionIdsWithAttendance.slice(0, 50))
        .order('session_date', { ascending: false })
        .limit(10);

      if (sessionsData) {
        for (const s of sessionsData) {
          const { count } = await supabase
            .from('attendance_records')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', s.id);

          const g = s.groups as unknown as { name: string } | null;
          recentActivity.push({
            groupName: g?.name ?? 'Unknown',
            sessionDate: s.session_date,
            attendanceCount: count ?? 0,
          });
        }
      }
    }

    // ── 5. Flagged Participants (2+ consecutive absences) ──

    const flaggedByGroup: { groupName: string; groupSlug: string; flaggedCount: number }[] = [];

    if (activeGroups) {
      for (const group of activeGroups) {
        // Get active participants
        const { data: members } = await supabase
          .from('group_memberships')
          .select('profile_id')
          .eq('group_id', group.id)
          .eq('role', 'participant')
          .eq('is_active', true);

        // Get past sessions for this group ordered by date desc
        const { data: pastSessions } = await supabase
          .from('sessions')
          .select('id, session_date')
          .eq('group_id', group.id)
          .eq('is_cancelled', false)
          .lte('session_date', todayStr)
          .order('session_date', { ascending: false })
          .limit(10);

        if (!members || !pastSessions || pastSessions.length < 2) {
          continue;
        }

        const pastSessionIds = pastSessions.map((s) => s.id);

        // Fetch attendance records for these sessions
        const { data: records } = await supabase
          .from('attendance_records')
          .select('session_id, participant_id, status')
          .in('session_id', pastSessionIds);

        const recordMap: Record<string, Record<string, string>> = {};
        for (const r of records ?? []) {
          if (!recordMap[r.participant_id]) recordMap[r.participant_id] = {};
          recordMap[r.participant_id][r.session_id] = r.status;
        }

        let flaggedCount = 0;
        for (const member of members) {
          // Check last 2+ sessions for consecutive absences
          let consecutiveAbsences = 0;
          for (const session of pastSessions) {
            const status = recordMap[member.profile_id]?.[session.id];
            if (status === 'absent') {
              consecutiveAbsences++;
            } else {
              break;
            }
          }
          if (consecutiveAbsences >= 2) {
            flaggedCount++;
          }
        }

        if (flaggedCount > 0) {
          flaggedByGroup.push({
            groupName: group.name,
            groupSlug: group.slug,
            flaggedCount,
          });
        }
      }
    }

    flaggedByGroup.sort((a, b) => b.flaggedCount - a.flaggedCount);

    return NextResponse.json({
      summary: {
        totalParticipants: totalParticipants ?? 0,
        totalMadrichim: totalMadrichim ?? 0,
        totalGroups: totalGroups ?? 0,
        totalSessions: totalSessions ?? 0,
        overallAttendance,
      },
      birthdays: upcomingBirthdays,
      attendanceByGroup,
      recentActivity,
      flaggedByGroup,
    });
  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
