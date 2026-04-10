import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/supabase/auth-helpers';

/**
 * GET /api/admin/attendance/staff-by-area?area=katan|noar|pre-som|som
 *
 * Staff attendance data for the whole area in one payload. After the
 * migration 011 refactor, planning sessions live inside each primary
 * group (tagged with session_type='planning'), so this endpoint just
 * has to fetch the area's groups and return everything. No more
 * separate SOM Planning / Staff Planning groups to merge.
 */

interface AreaConfig {
  areas?: string[];
  slugs?: string[];
}

const AREA_CONFIG: Record<string, AreaConfig> = {
  katan: { areas: ['katan'] },
  noar: { areas: ['noar'] },
  'pre-som': { slugs: ['pre-som'] },
  som: { slugs: ['som'] },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');

    if (!area || !AREA_CONFIG[area]) {
      return NextResponse.json(
        { error: 'Valid area is required (katan, noar, pre-som, som)' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const today = format(new Date(), 'yyyy-MM-dd');

    const auth = await getAuthContext(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // ─── 1. Resolve which groups belong to this area ───
    const config = AREA_CONFIG[area];
    const orConditions: string[] = [];
    if (config.areas && config.areas.length > 0) {
      orConditions.push(`area.in.(${config.areas.join(',')})`);
    }
    if (config.slugs && config.slugs.length > 0) {
      orConditions.push(`slug.in.(${config.slugs.join(',')})`);
    }

    let areaGroups: Array<{ id: string; name: string; slug: string; area: string | null }> = [];
    if (orConditions.length > 0) {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, slug, area')
        .or(orConditions.join(','))
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      areaGroups = data ?? [];
    }

    // Coordinator: only keep groups they coordinate
    if (auth.groupIds) {
      const authorized = new Set(auth.groupIds);
      areaGroups = areaGroups.filter((g) => authorized.has(g.id));
    }

    if (areaGroups.length === 0) {
      return NextResponse.json({
        area,
        sessions: [],
        participants: [],
        events: [],
      });
    }

    const groupMap = new Map(areaGroups.map((g) => [g.id, g]));
    const groupIds = areaGroups.map((g) => g.id);

    // ─── 2. Sessions in those groups ───
    const { data: sessionRows, error: sessErr } = await supabase
      .from('sessions')
      .select('id, group_id, session_date, session_type, is_cancelled')
      .in('group_id', groupIds)
      .order('session_date', { ascending: true });
    if (sessErr) throw new Error(sessErr.message);
    const sessionList = sessionRows ?? [];
    const sessionIds = sessionList.map((s) => s.id);

    // ─── 3. Memberships (madrich / mazkirut) for those groups ───
    const { data: memberships, error: memErr } = await supabase
      .from('group_memberships')
      .select(
        'profile_id, group_id, role, profiles(id, first_name, last_name, is_active)'
      )
      .in('group_id', groupIds)
      .in('role', ['madrich', 'mazkirut'])
      .eq('is_active', true);
    if (memErr) throw new Error(memErr.message);

    // ─── 4. Attendance records for those sessions ───
    // Small chunks + explicit limit to stay under Supabase's default 1000-row cap.
    const records: Array<{ session_id: string; participant_id: string; status: string }> = [];
    if (sessionIds.length > 0) {
      for (let i = 0; i < sessionIds.length; i += 50) {
        const chunk = sessionIds.slice(i, i + 50);
        const { data } = await supabase
          .from('attendance_records')
          .select('session_id, participant_id, status')
          .in('session_id', chunk)
          .limit(10000);
        records.push(...(data ?? []));
      }
    }

    // ─── 5. Events linked to any of these groups ───
    const { data: eventGroupLinks } = await supabase
      .from('event_groups')
      .select('event_id')
      .in('group_id', groupIds);
    const eventIds = Array.from(
      new Set((eventGroupLinks ?? []).map((e) => e.event_id))
    );

    let eventList: Array<{
      id: string;
      name: string;
      event_date: string;
      real_hours: number;
    }> = [];
    let eventAttendance: Array<{ event_id: string; participant_id: string; attended: boolean }> = [];
    if (eventIds.length > 0) {
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, event_date, real_hours')
        .in('id', eventIds)
        .order('event_date');
      eventList = evs ?? [];

      const { data: ea } = await supabase
        .from('event_attendance')
        .select('event_id, participant_id, attended')
        .in('event_id', eventIds)
        .limit(10000);
      eventAttendance = ea ?? [];
    }

    const eventAttendanceMap = new Map<string, Map<string, boolean>>();
    for (const ea of eventAttendance) {
      if (!eventAttendanceMap.has(ea.event_id)) {
        eventAttendanceMap.set(ea.event_id, new Map());
      }
      eventAttendanceMap.get(ea.event_id)!.set(ea.participant_id, ea.attended);
    }

    // ─── 6. Deduplicate participants across memberships ───
    interface BuildMember {
      id: string;
      firstName: string;
      lastName: string;
      role: 'madrich' | 'mazkirut';
      groupIds: Set<string>;
      primaryGroupId: string | null;
      primaryGroupName: string | null;
    }
    const participantMap = new Map<string, BuildMember>();
    for (const m of memberships ?? []) {
      const p = m.profiles as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
      } | null;
      if (!p || !p.is_active) continue;

      const existing = participantMap.get(p.id);
      const group = groupMap.get(m.group_id);

      if (existing) {
        existing.groupIds.add(m.group_id);
        if (!existing.primaryGroupId && group) {
          existing.primaryGroupId = group.id;
          existing.primaryGroupName = group.name;
        }
      } else {
        participantMap.set(p.id, {
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          role: m.role as 'madrich' | 'mazkirut',
          groupIds: new Set([m.group_id]),
          primaryGroupId: group?.id ?? null,
          primaryGroupName: group?.name ?? null,
        });
      }
    }

    // ─── 7. Build records map per participant ───
    const recordsByParticipant = new Map<string, Map<string, string>>();
    for (const r of records) {
      if (!recordsByParticipant.has(r.participant_id)) {
        recordsByParticipant.set(r.participant_id, new Map());
      }
      recordsByParticipant.get(r.participant_id)!.set(r.session_id, r.status);
    }

    // ─── 8. Build participants list + compute stats ───
    const participants = Array.from(participantMap.values()).map((p) => {
      const mine = recordsByParticipant.get(p.id) ?? new Map();
      const recordsObj: Record<string, string> = {};
      for (const [sessionId, status] of mine.entries()) {
        recordsObj[sessionId] = status;
      }

      // Percentage: past non-cancelled sessions in the member's groups,
      // both regular and planning count toward staff attendance.
      let present = 0;
      let total = 0;
      for (const s of sessionList) {
        if (!p.groupIds.has(s.group_id)) continue;
        if (s.is_cancelled) continue;
        if (s.session_date > today) continue;
        total += 1;
        const st = recordsObj[s.id];
        if (st === 'present' || st === 'late') present += 1;
      }

      // Event attendance: only counted when explicitly marked. Default
      // unchecked, mirroring the chanichim flow — admins/coordinators
      // mark each madrich on the event's attendance panel.
      const eventRecords: Record<string, boolean> = {};
      for (const ev of eventList) {
        if (ev.event_date > today) continue;
        const explicit = eventAttendanceMap.get(ev.id)?.get(p.id);
        eventRecords[ev.id] = explicit === true;
      }

      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        role: p.role,
        primaryGroupId: p.primaryGroupId,
        primaryGroupName: p.primaryGroupName,
        groupIds: Array.from(p.groupIds),
        records: recordsObj,
        eventRecords,
        stats: { percentage, present, total },
      };
    });

    participants.sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
        a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
    );

    // ─── 9. Build session headers ───
    const sessionsWithRecords = new Set(records.map((r) => r.session_id));
    const sessions = sessionList.map((s) => {
      const g = groupMap.get(s.group_id);
      return {
        id: s.id,
        groupId: s.group_id,
        groupName: g?.name ?? 'Unknown',
        groupSlug: g?.slug ?? '',
        date: s.session_date,
        sessionType: (s.session_type ?? 'regular') as 'regular' | 'planning',
        isCancelled: s.is_cancelled,
        hasAttendance: sessionsWithRecords.has(s.id),
        isFuture: s.session_date > today,
      };
    });

    // ─── 10. Build events list ───
    const events = eventList.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.event_date,
      hours: Number(e.real_hours ?? 0),
    }));

    return NextResponse.json({ area, sessions, participants, events });
  } catch (err) {
    console.error('staff-by-area error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
