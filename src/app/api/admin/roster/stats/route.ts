import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    // Fetch groups with participant counts
    const { data: groups, error: groupsError } = await adminClient
      .from('groups')
      .select('id, name, slug, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (groupsError) {
      throw new Error(`Failed to load groups: ${groupsError.message}`);
    }

    // Fetch active memberships count per group
    const { data: memberships, error: memberError } = await adminClient
      .from('group_memberships')
      .select('group_id')
      .eq('is_active', true)
      .eq('role', 'participant');

    if (memberError) {
      throw new Error(`Failed to load memberships: ${memberError.message}`);
    }

    // Count per group
    const countMap = new Map<string, number>();
    for (const m of memberships ?? []) {
      countMap.set(m.group_id, (countMap.get(m.group_id) ?? 0) + 1);
    }

    const stats = (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      participantCount: countMap.get(g.id) ?? 0,
    }));

    // Total participants
    const { count: totalParticipants } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'participant')
      .eq('is_active', true);

    return NextResponse.json({
      stats,
      totalParticipants: totalParticipants ?? 0,
    });
  } catch (err) {
    console.error('Roster stats error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load stats' },
      { status: 500 }
    );
  }
}
