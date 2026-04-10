import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/supabase/auth-helpers';

/**
 * GET /api/admin/attendance/staff-by-area?area=katan|noar|pre-som|som
 *
 * Returns a flat list of madrichim / mazkirut across an entire area,
 * with sessions from every group in that area (including the right
 * planning group) merged into a single grid. This is what the user
 * sees on /admin/madrich-attendance.
 *
 * The grid is built frontend-side from this payload:
 *   sessions[]     — one entry per actual session row (group + date)
 *   participants[] — one entry per staff member (deduped), with their
 *                    primary group for display and a records map keyed
 *                    by session_id so the frontend can look up the
 *                    status in O(1).
 *
 * The frontend merges sessions by date when rendering columns and
 * uses the member's group memberships to pick the right session
 * cell for each (member, date) pair.
 */

interface AreaConfig {
  /** Match groups.area field */
  areas?: string[];
  /** Match groups.slug exactly */
  slugs?: string[];
  /** Always include these groups by slug (e.g. the staff-planning group) */
  alwaysIncludeSlugs?: string[];
}

const AREA_CONFIG: Record<string, AreaConfig> = {
  katan: { areas: ['katan'], alwaysIncludeSlugs: ['staff-planning'] },
  noar: { areas: ['noar'], alwaysIncludeSlugs: ['staff-planning'] },
  'pre-som': { slugs: ['pre-som'], alwaysIncludeSlugs: ['staff-planning'] },
  som: { slugs: ['som', 'som-planning'] },
};

const PLANNING_SLUGS = new Set(['som-planning', 'staff-planning']);

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

    // Add the extra "always include" groups (staff-planning)
    if (config.alwaysIncludeSlugs && config.alwaysIncludeSlugs.length > 0) {
      const { data: extras } = await supabase
        .from('groups')
        .select('id, name, slug, area')
        .in('slug', config.alwaysIncludeSlugs)
        .eq('is_active', true);
      for (const e of extras ?? []) {
        if (!areaGroups.some((g) => g.id === e.id)) {
          areaGroups.push(e);
        }
      }
    }

    // Coordinator: filter groups to only those they coordinate
    if (auth.groupIds) {
      const authorized = new Set(auth.groupIds);
      areaGroups = areaGroups.filter((g) => authorized.has(g.id));
    }

    if (areaGroups.length === 0) {
      return NextResponse.json({ area, sessions: [], participants: [] });
    }

    const groupMap = new Map(areaGroups.map((g) => [g.id, g]));
    const groupIds = areaGroups.map((g) => g.id);

    // ─── 2. Sessions in those groups ───
    const { data: sessionRows, error: sessErr } = await supabase
      .from('sessions')
      .select('id, group_id, session_date, is_cancelled, is_locked_staff')
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
    const records: Array<{ session_id: string; participant_id: string; status: string }> = [];
    if (sessionIds.length > 0) {
      for (let i = 0; i < sessionIds.length; i += 200) {
        const chunk = sessionIds.slice(i, i + 200);
        const { data } = await supabase
          .from('attendance_records')
          .select('session_id, participant_id, status')
          .in('session_id', chunk);
        records.push(...(data ?? []));
      }
    }

    // ─── 5. Deduplicate participants across memberships ───
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
      const isPlanning = group ? PLANNING_SLUGS.has(group.slug) : false;

      if (existing) {
        existing.groupIds.add(m.group_id);
        // Upgrade primary group to a non-planning group if we haven't set one yet
        if (!existing.primaryGroupId && !isPlanning && group) {
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
          primaryGroupId: isPlanning ? null : m.group_id,
          primaryGroupName: isPlanning ? null : group?.name ?? null,
        });
      }
    }

    // ─── 6. Build records map per participant ───
    const recordsByParticipant = new Map<string, Map<string, string>>();
    for (const r of records) {
      if (!recordsByParticipant.has(r.participant_id)) {
        recordsByParticipant.set(r.participant_id, new Map());
      }
      recordsByParticipant.get(r.participant_id)!.set(r.session_id, r.status);
    }

    // ─── 7. Flatten participants for response + compute stats ───
    const sessionInfoById = new Map(
      sessionList.map((s) => [
        s.id,
        {
          group_id: s.group_id,
          date: s.session_date,
          isCancelled: s.is_cancelled,
        },
      ])
    );

    const participants = Array.from(participantMap.values()).map((p) => {
      const mine = recordsByParticipant.get(p.id) ?? new Map();
      const recordsObj: Record<string, string> = {};
      for (const [sessionId, status] of mine.entries()) {
        recordsObj[sessionId] = status;
      }

      // Percentage: past, non-cancelled sessions from the member's groups
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
        stats: { percentage, present, total },
      };
    });

    // Sort by last name initially (frontend can re-sort)
    participants.sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
        a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
    );

    // ─── 8. Build session headers ───
    const sessionsWithRecords = new Set(records.map((r) => r.session_id));
    const sessions = sessionList.map((s) => {
      const g = groupMap.get(s.group_id);
      void sessionInfoById; // lookup map is for readers, keep it in scope
      return {
        id: s.id,
        groupId: s.group_id,
        groupName: g?.name ?? 'Unknown',
        groupSlug: g?.slug ?? '',
        date: s.session_date,
        isCancelled: s.is_cancelled,
        isLocked: !!s.is_locked_staff,
        hasAttendance: sessionsWithRecords.has(s.id),
        isFuture: s.session_date > today,
      };
    });

    return NextResponse.json({ area, sessions, participants });
  } catch (err) {
    console.error('staff-by-area error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
