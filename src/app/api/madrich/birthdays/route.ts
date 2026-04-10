import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/madrich/birthdays
 *
 * Returns upcoming chanichim (participant) birthdays within the next 30
 * days for the currently-logged-in madrich / mazkirut, scoped to the
 * participants of their active group memberships.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Make sure the caller is actually a madrich / mazkirut
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || (profile.role !== 'madrich' && profile.role !== 'mazkirut')) {
      return NextResponse.json(
        { error: 'Only madrichim and mazkirut can view this' },
        { status: 403 }
      );
    }

    // Pull the madrich's active group memberships
    const { data: myMemberships } = await admin
      .from('group_memberships')
      .select('group_id')
      .eq('profile_id', user.id)
      .in('role', ['madrich', 'mazkirut'])
      .eq('is_active', true);

    const groupIds = (myMemberships ?? []).map((m) => m.group_id);
    if (groupIds.length === 0) {
      return NextResponse.json({ birthdays: [] });
    }

    // Get the chanichim (participants) of those groups
    const { data: participantMemberships } = await admin
      .from('group_memberships')
      .select('profile_id, groups(name)')
      .in('group_id', groupIds)
      .eq('role', 'participant')
      .eq('is_active', true);

    const participantIds = Array.from(
      new Set((participantMemberships ?? []).map((m) => m.profile_id))
    );

    if (participantIds.length === 0) {
      return NextResponse.json({ birthdays: [] });
    }

    // Map profile id → first group name (for display)
    const groupNameByProfile = new Map<string, string>();
    for (const m of participantMemberships ?? []) {
      if (!groupNameByProfile.has(m.profile_id)) {
        const g = m.groups as unknown as { name: string } | null;
        if (g?.name) groupNameByProfile.set(m.profile_id, g.name);
      }
    }

    // Load profiles with a birthdate
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, first_name, last_name, birthdate, is_active')
      .in('id', participantIds)
      .eq('is_active', true)
      .not('birthdate', 'is', null);

    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const upcoming: Array<{
      id: string;
      firstName: string;
      lastName: string;
      birthdate: string;
      daysUntil: number;
      turningAge: number;
      groupName: string | null;
    }> = [];

    for (const p of profiles ?? []) {
      if (!p.birthdate) continue;
      const bd = new Date(p.birthdate + 'T00:00:00');
      const thisYearBd = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      let daysUntil = Math.floor(
        (thisYearBd.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil < 0) {
        const nextYearBd = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
        daysUntil = Math.floor(
          (nextYearBd.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      if (daysUntil <= 30) {
        const turningAge = today.getFullYear() - bd.getFullYear() + (daysUntil > 0 ? 1 : 0);
        upcoming.push({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthdate: p.birthdate,
          daysUntil,
          turningAge,
          groupName: groupNameByProfile.get(p.id) ?? null,
        });
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    return NextResponse.json({ birthdays: upcoming });
  } catch (err) {
    console.error('Madrich birthdays error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load birthdays' },
      { status: 500 }
    );
  }
}
