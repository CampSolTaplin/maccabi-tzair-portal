import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/madrich/my-hours
 *
 * Returns the community-hours breakdown for the currently-logged-in
 * madrich / mazkirut so they can see their own totals and generate
 * their own service letter from /madrich/hours.
 *
 * Logic mirrors /api/admin/hours (which is scoped to chanichim): we
 * sum non-cancelled sessions in each of the user's groups where their
 * status is 'present', split by day-of-week, and multiply by the
 * hours_present column on each session.
 */

interface SessionRow {
  id: string;
  group_id: string;
  session_date: string;
  is_cancelled: boolean;
  hours_present: number;
  hours_late: number;
}

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'madrich' && profile.role !== 'mazkirut')) {
    return NextResponse.json(
      { error: 'Only madrichim and mazkirut can view community hours' },
      { status: 403 }
    );
  }

  // Active group memberships for this user
  const { data: memberships } = await admin
    .from('group_memberships')
    .select('group_id, role, groups(id, name, slug, area)')
    .eq('profile_id', user.id)
    .in('role', ['madrich', 'mazkirut'])
    .eq('is_active', true);

  const groups = (memberships ?? [])
    .map((m) => m.groups as unknown as { id: string; name: string; slug: string; area: string | null } | null)
    .filter((g): g is { id: string; name: string; slug: string; area: string | null } => g !== null);

  if (groups.length === 0) {
    return NextResponse.json({
      profile: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
      },
      groups: [],
      breakdown: {
        saturdays: { count: 0, hours: 0 },
        weekdays: { count: 0, hours: 0 },
        lateSessions: { count: 0, hours: 0 },
        grandTotal: 0,
      },
    });
  }

  const groupIds = groups.map((g) => g.id);

  // Get all non-cancelled sessions for those groups
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, group_id, session_date, is_cancelled, hours_present, hours_late')
    .in('group_id', groupIds)
    .eq('is_cancelled', false);

  const sessionList: SessionRow[] = (sessions ?? []) as SessionRow[];
  const sessionIds = sessionList.map((s) => s.id);

  // Fetch only this user's own attendance_records for those sessions
  let records: Array<{ session_id: string; status: string }> = [];
  if (sessionIds.length > 0) {
    for (let i = 0; i < sessionIds.length; i += 200) {
      const chunk = sessionIds.slice(i, i + 200);
      const { data } = await admin
        .from('attendance_records')
        .select('session_id, status')
        .eq('participant_id', user.id)
        .in('session_id', chunk);
      records = records.concat(data ?? []);
    }
  }

  const sessionById = new Map(sessionList.map((s) => [s.id, s]));

  let saturdayCount = 0;
  let saturdayHours = 0;
  let weekdayCount = 0;
  let weekdayHours = 0;
  let lateCount = 0;
  let lateHours = 0;

  const perGroup = new Map<
    string,
    { sessions: number; hours: number; groupId: string }
  >();

  for (const rec of records) {
    const session = sessionById.get(rec.session_id);
    if (!session) continue;

    const d = new Date(session.session_date + 'T12:00:00');
    const dow = d.getDay();

    let hours = 0;
    if (rec.status === 'present') {
      hours = Number(session.hours_present ?? 0);
      if (dow === 6) {
        saturdayCount += 1;
        saturdayHours += hours;
      } else {
        weekdayCount += 1;
        weekdayHours += hours;
      }
    } else if (rec.status === 'late') {
      hours = Number(session.hours_late ?? 0);
      lateCount += 1;
      lateHours += hours;
    } else {
      // excused / absent → no hours
      continue;
    }

    const existing = perGroup.get(session.group_id) ?? {
      sessions: 0,
      hours: 0,
      groupId: session.group_id,
    };
    existing.sessions += 1;
    existing.hours += hours;
    perGroup.set(session.group_id, existing);
  }

  // ─── Events linked to the madrich's groups ───
  // A madrich is considered attending any event their group is linked to
  // unless there's an explicit event_attendance row with attended = false.
  const todayDate = new Date().toISOString().slice(0, 10);
  const eventsAttended: Array<{ id: string; name: string; date: string; hours: number }> = [];
  let eventTotal = 0;

  const { data: linkedEvents } = await admin
    .from('event_groups')
    .select('event_id')
    .in('group_id', groupIds);
  const eventIds = Array.from(new Set((linkedEvents ?? []).map((e) => e.event_id)));

  if (eventIds.length > 0) {
    const { data: eventRows } = await admin
      .from('events')
      .select('id, name, event_date, real_hours')
      .in('id', eventIds)
      .lte('event_date', todayDate)
      .order('event_date');

    const { data: myEventMarks } = await admin
      .from('event_attendance')
      .select('event_id, attended')
      .eq('participant_id', user.id)
      .in('event_id', eventIds);
    const markByEvent = new Map<string, boolean>();
    for (const r of myEventMarks ?? []) markByEvent.set(r.event_id, r.attended);

    for (const ev of eventRows ?? []) {
      // Default: attending unless explicitly false
      const attended = markByEvent.has(ev.id) ? markByEvent.get(ev.id)! : true;
      if (!attended) continue;
      const hours = Number(ev.real_hours ?? 0);
      eventsAttended.push({
        id: ev.id,
        name: ev.name,
        date: ev.event_date,
        hours,
      });
      eventTotal += hours;
    }
  }

  const grandTotal = saturdayHours + weekdayHours + lateHours + eventTotal;

  return NextResponse.json({
    profile: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      role: profile.role,
    },
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      area: g.area,
      sessions: perGroup.get(g.id)?.sessions ?? 0,
      hours: perGroup.get(g.id)?.hours ?? 0,
    })),
    events: eventsAttended,
    breakdown: {
      saturdays: { count: saturdayCount, hours: saturdayHours },
      weekdays: { count: weekdayCount, hours: weekdayHours },
      lateSessions: { count: lateCount, hours: lateHours },
      eventTotal,
      grandTotal,
    },
  });
}
