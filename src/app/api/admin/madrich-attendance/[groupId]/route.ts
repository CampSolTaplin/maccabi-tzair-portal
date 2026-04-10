import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/madrich-attendance/:groupId
 *
 * Returns the roster (madrich + mazkirut members of the group) plus the
 * group's sessions, so the coordinator UI can pick a session and mark
 * staff attendance.
 *
 * Access:
 *   - admin: any group
 *   - coordinator: only groups they coordinate
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify the caller is admin OR a coordinator of this specific group
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (callerProfile.role !== 'admin') {
    if (callerProfile.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: myCoord } = await admin
      .from('group_memberships')
      .select('id')
      .eq('profile_id', user.id)
      .eq('group_id', groupId)
      .eq('role', 'coordinator')
      .eq('is_active', true)
      .maybeSingle();
    if (!myCoord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Look up the group
  const { data: group, error: groupErr } = await admin
    .from('groups')
    .select('id, name, slug, area')
    .eq('id', groupId)
    .single();

  if (groupErr || !group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  // Staff members of this group (madrich and mazkirut)
  const { data: staffMemberships, error: staffErr } = await admin
    .from('group_memberships')
    .select('profile_id, role, profiles(id, first_name, last_name, role, is_active)')
    .eq('group_id', groupId)
    .in('role', ['madrich', 'mazkirut'])
    .eq('is_active', true);

  if (staffErr) {
    return NextResponse.json({ error: staffErr.message }, { status: 500 });
  }

  const members: Array<{
    id: string;
    firstName: string;
    lastName: string;
    role: 'madrich' | 'mazkirut';
  }> = [];

  for (const m of staffMemberships ?? []) {
    const p = m.profiles as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    } | null;
    if (!p || !p.is_active) continue;
    members.push({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      role: (p.role as 'madrich' | 'mazkirut') ?? 'madrich',
    });
  }

  members.sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
      a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
  );

  // Sessions for this group, most recent first
  const { data: sessions, error: sessErr } = await admin
    .from('sessions')
    .select('id, session_date, session_type, title, is_cancelled, is_locked, is_locked_staff')
    .eq('group_id', groupId)
    .eq('is_cancelled', false)
    .order('session_date', { ascending: false });

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  return NextResponse.json({
    group,
    members,
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      sessionDate: s.session_date,
      sessionType: s.session_type,
      title: s.title,
      isLocked: s.is_locked,
      isLockedStaff: s.is_locked_staff,
    })),
  });
}
