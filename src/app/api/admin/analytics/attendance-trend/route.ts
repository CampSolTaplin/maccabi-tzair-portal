import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const AREA_COLORS: Record<string, string> = {
  katan: '#3b82f6',
  noar: '#8b5cf6',
  leadership: '#f59e0b',
};

const GROUP_COLORS: Record<string, string> = {
  som: '#f59e0b',
  'pre-som': '#f97316',
  'madrichim-katan': '#3b82f6',
  'madrichim-noar': '#8b5cf6',
  'madrichim-keff': '#06b6d4',
  'mazkirut-som': '#ef4444',
  'mazkirut-pre-som': '#ec4899',
  'mazkirut-hanaga': '#14b8a6',
  kinder: '#22c55e',
  '1st-grade': '#10b981',
  '2nd-grade': '#0ea5e9',
  '3rd-grade': '#6366f1',
  '4th-grade': '#a855f7',
  '5th-grade': '#d946ef',
  '6th-grade': '#8b5cf6',
  '7th-grade': '#7c3aed',
  '8th-grade': '#6d28d9',
};

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get all active groups
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, slug, area, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (!groups || groups.length === 0) {
      return NextResponse.json({ groups: [], data: [] });
    }

    // Get all non-cancelled sessions with their group
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, group_id, session_date, is_cancelled')
      .eq('is_cancelled', false)
      .lte('session_date', new Date().toISOString().split('T')[0])
      .order('session_date');

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ groups: [], data: [] });
    }

    const sessionIds = sessions.map(s => s.id);

    // Get all attendance records in chunks
    let allRecords: { session_id: string; participant_id: string; status: string }[] = [];
    for (let i = 0; i < sessionIds.length; i += 50) {
      const chunk = sessionIds.slice(i, i + 50);
      const { data } = await supabase
        .from('attendance_records')
        .select('session_id, participant_id, status')
        .in('session_id', chunk);
      allRecords.push(...(data ?? []));
    }

    // Get participant counts per group (active members)
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('group_id, profile_id')
      .eq('role', 'participant')
      .eq('is_active', true);

    const memberCountByGroup = new Map<string, number>();
    for (const m of memberships ?? []) {
      memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
    }

    // Build records lookup: sessionId → count of present+late
    const recordsBySession = new Map<string, { present: number; total: number }>();
    for (const r of allRecords) {
      const entry = recordsBySession.get(r.session_id) ?? { present: 0, total: 0 };
      entry.total++;
      if (r.status === 'present' || r.status === 'late') entry.present++;
      recordsBySession.set(r.session_id, entry);
    }

    // Build group lookup
    const groupMap = new Map(groups.map(g => [g.id, g]));

    // Aggregate: for each (date, group), compute attendance %
    // Group sessions by date
    const dateGroupData = new Map<string, Map<string, number>>();

    for (const s of sessions) {
      const records = recordsBySession.get(s.id);
      if (!records || records.total === 0) continue; // Skip sessions without attendance

      const group = groupMap.get(s.group_id);
      if (!group) continue;

      const memberCount = memberCountByGroup.get(s.group_id) ?? records.total;
      const pct = Math.round((records.present / memberCount) * 100);

      if (!dateGroupData.has(s.session_date)) {
        dateGroupData.set(s.session_date, new Map());
      }
      dateGroupData.get(s.session_date)!.set(group.slug, pct);
    }

    // Convert to array sorted by date
    const dates = [...dateGroupData.keys()].sort();
    const data = dates.map(date => {
      const entry: Record<string, string | number> = { date };
      const groupPcts = dateGroupData.get(date)!;
      for (const [slug, pct] of groupPcts) {
        entry[slug] = pct;
      }
      return entry;
    });

    // Build group info with colors
    const groupInfo = groups.map(g => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      area: g.area,
      color: GROUP_COLORS[g.slug] ?? AREA_COLORS[g.area] ?? '#6b7280',
    }));

    return NextResponse.json({ groups: groupInfo, data });
  } catch (err) {
    console.error('Attendance trend error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
