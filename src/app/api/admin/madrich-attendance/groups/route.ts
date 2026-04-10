import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/madrich-attendance/groups
 *
 * Returns the list of groups the current user can take staff attendance for.
 *   - admin: all active groups
 *   - coordinator: only the groups they're actively a coordinator of
 *   - anyone else: 403
 */
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
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'coordinator')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (profile.role === 'admin') {
    const { data, error } = await admin
      .from('groups')
      .select('id, name, slug, area, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ groups: data ?? [] });
  }

  // coordinator: only their groups
  const { data: memberships, error: memErr } = await admin
    .from('group_memberships')
    .select('group_id, groups(id, name, slug, area, sort_order)')
    .eq('profile_id', user.id)
    .eq('role', 'coordinator')
    .eq('is_active', true);

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const groups: Array<{ id: string; name: string; slug: string; area: string | null; sort_order: number }> = [];
  for (const m of memberships ?? []) {
    const g = m.groups as unknown as {
      id: string;
      name: string;
      slug: string;
      area: string | null;
      sort_order: number;
    } | null;
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    groups.push(g);
  }

  groups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  return NextResponse.json({ groups });
}
