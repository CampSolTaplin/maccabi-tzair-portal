import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// Planning groups don't have chanichim, so madrichim should not pick them
// up when they're looking for the group whose participants they mark.
const EXCLUDED_GROUP_SLUGS = ['som-planning', 'staff-planning'];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get madrich's group memberships (may be several). Exclude planning
    // groups — those are managed by coordinators via /admin/madrich-attendance.
    const { data: memberships, error: memErr } = await admin
      .from('group_memberships')
      .select('group_id, groups(id, name, slug)')
      .eq('profile_id', user.id)
      .in('role', ['madrich', 'mazkirut'])
      .eq('is_active', true);

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const membership = (memberships ?? []).find((m) => {
      const g = m.groups as unknown as { slug: string } | null;
      return g && !EXCLUDED_GROUP_SLUGS.includes(g.slug);
    });

    if (!membership) {
      return NextResponse.json({ error: 'No group assigned' }, { status: 404 });
    }

    // Get participants in that group
    const { data: participants } = await admin
      .from('group_memberships')
      .select('profile_id, profiles(id, first_name, last_name)')
      .eq('group_id', membership.group_id)
      .eq('role', 'participant')
      .eq('is_active', true);

    const groupName = (membership.groups as unknown as { name: string })?.name ?? '';

    const members = (participants ?? [])
      .map((p) => {
        const profile = p.profiles as unknown as { id: string; first_name: string; last_name: string } | null;
        if (!profile) return null;
        return {
          id: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.lastName.localeCompare(b!.lastName) || a!.firstName.localeCompare(b!.firstName));

    return NextResponse.json({
      groupId: membership.group_id,
      groupName,
      members,
    });
  } catch (err) {
    console.error('Group members error:', err);
    return NextResponse.json({ error: 'Failed to load group members' }, { status: 500 });
  }
}
