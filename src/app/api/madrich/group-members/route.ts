import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Madrichim / mazkirut take chanichim attendance for the first of
    // their active group memberships. All groups are primary groups now —
    // the old "Planning" helper groups are gone after migration 011.
    const { data: membership, error: memErr } = await admin
      .from('group_memberships')
      .select('group_id, groups(id, name)')
      .eq('profile_id', user.id)
      .in('role', ['madrich', 'mazkirut'])
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (memErr || !membership) {
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
