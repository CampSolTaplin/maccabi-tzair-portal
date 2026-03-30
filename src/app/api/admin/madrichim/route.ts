import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/* ─── Helpers ─── */

function generatePassword(lastName: string): string {
  const prefix = 'Mtz';
  const lastNamePart = lastName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toLowerCase();
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${lastNamePart}${digits}!`;
}

async function requireAdmin(supabase: ReturnType<typeof createAdminClient>) {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 }) };
  }

  return { user };
}

/* ─── GET: list all users (admin, coordinator, madrich) ─── */

export async function GET() {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    // Get all profiles (all roles)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, phone, is_active')
      .in('role', ['admin', 'coordinator', 'madrich'])
      .order('role')
      .order('last_name');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Get group memberships for coordinator and madrich users
    const profileIds = (profiles ?? []).map((p) => p.id);
    const { data: memberships, error: membershipError } = await supabase
      .from('group_memberships')
      .select(`
        profile_id,
        group_id,
        role,
        is_active,
        groups (id, name, slug, area)
      `)
      .in('profile_id', profileIds.length > 0 ? profileIds : ['__none__'])
      .in('role', ['madrich', 'coordinator']);

    if (membershipError) {
      throw new Error(`Failed to fetch memberships: ${membershipError.message}`);
    }

    // Get auth emails
    const {
      data: { users },
      error: usersError,
    } = await supabase.auth.admin.listUsers();
    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const emailMap = new Map(users.map((u) => [u.id, u.email]));

    // Build membership map (supports multiple groups per user)
    const membershipMap = new Map<
      string,
      { groupId: string; groupName: string; groupArea: string | null }[]
    >();

    for (const m of memberships ?? []) {
      if (!m.is_active) continue;
      const group = m.groups as unknown as {
        id: string;
        name: string;
        slug: string;
        area: string | null;
      } | null;
      const entry = {
        groupId: m.group_id,
        groupName: group?.name ?? 'Unknown',
        groupArea: group?.area ?? null,
      };
      const existing = membershipMap.get(m.profile_id) ?? [];
      existing.push(entry);
      membershipMap.set(m.profile_id, existing);
    }

    const allUsers = (profiles ?? []).map((p) => {
      const groups = membershipMap.get(p.id) ?? [];
      const first = groups[0] ?? null;
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: emailMap.get(p.id) ?? null,
        phone: p.phone,
        role: p.role as 'admin' | 'coordinator' | 'madrich',
        isActive: p.is_active ?? true,
        // Single group fields (backward compat for madrichim)
        groupId: first?.groupId ?? null,
        groupName: first?.groupName ?? null,
        groupArea: first?.groupArea ?? null,
        membershipActive: groups.length > 0,
        // Multi-group array (for coordinators)
        groups,
      };
    });

    // Also return as "madrichim" for backward compatibility
    return NextResponse.json({ users: allUsers, madrichim: allUsers });
  } catch (err) {
    console.error('Users fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/* ─── POST: create new user ─── */

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    const { email, firstName, lastName, groupId, groupIds, role } = await request.json();
    const userRole = role ?? 'madrich';

    // Coordinators can receive groupIds array; madrichim use single groupId
    const resolvedGroupIds: string[] =
      userRole === 'coordinator' && Array.isArray(groupIds) && groupIds.length > 0
        ? groupIds
        : groupId
          ? [groupId]
          : [];

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'email, firstName, and lastName are required' },
        { status: 400 }
      );
    }

    // coordinator and madrich require at least one group
    if ((userRole === 'coordinator' || userRole === 'madrich') && resolvedGroupIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one group is required for coordinator and madrich roles' },
        { status: 400 }
      );
    }

    if (!['admin', 'coordinator', 'madrich'].includes(userRole)) {
      return NextResponse.json(
        { error: 'role must be admin, coordinator, or madrich' },
        { status: 400 }
      );
    }

    const password = generatePassword(lastName);

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: userRole,
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    const userId = authData.user.id;

    // 2. Upsert profile (trigger may have created it, so upsert)
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        role: userRole,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // 3. Create group memberships (for coordinator and madrich)
    if ((userRole === 'coordinator' || userRole === 'madrich') && resolvedGroupIds.length > 0) {
      const rows = resolvedGroupIds.map((gId: string) => ({
        profile_id: userId,
        group_id: gId,
        role: userRole,
        is_active: true,
      }));
      const { error: membershipError } = await supabase.from('group_memberships').insert(rows);

      if (membershipError) {
        throw new Error(`Failed to assign group(s): ${membershipError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      madrich: {
        id: userId,
        email,
        firstName,
        lastName,
        role: userRole,
        groupId: resolvedGroupIds[0] ?? null,
        groupIds: resolvedGroupIds,
        generatedPassword: password,
      },
    });
  } catch (err) {
    console.error('User creation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create user' },
      { status: 500 }
    );
  }
}

/* ─── PATCH: update group assignment, deactivate, reactivate, or change role ─── */

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    const { profileId, action, groupId, role } = await request.json();

    if (!profileId || !action) {
      return NextResponse.json(
        { error: 'profileId and action are required' },
        { status: 400 }
      );
    }

    if (action === 'reassign') {
      if (!groupId) {
        return NextResponse.json({ error: 'groupId is required for reassign' }, { status: 400 });
      }

      // Get current role to use correct membership role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', profileId)
        .single();

      const membershipRole = profile?.role === 'coordinator' ? 'coordinator' : 'madrich';

      // Deactivate existing memberships for this profile
      await supabase
        .from('group_memberships')
        .update({ is_active: false })
        .eq('profile_id', profileId)
        .in('role', ['madrich', 'coordinator']);

      // Insert new active membership
      const { error: insertError } = await supabase.from('group_memberships').insert({
        profile_id: profileId,
        group_id: groupId,
        role: membershipRole,
        is_active: true,
      });

      if (insertError) {
        throw new Error(`Failed to reassign group: ${insertError.message}`);
      }

      return NextResponse.json({ success: true, action: 'reassigned' });
    }

    if (action === 'deactivate') {
      // Deactivate profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', profileId);

      if (profileError) {
        throw new Error(`Failed to deactivate profile: ${profileError.message}`);
      }

      // Deactivate all memberships
      await supabase
        .from('group_memberships')
        .update({ is_active: false })
        .eq('profile_id', profileId)
        .in('role', ['madrich', 'coordinator']);

      return NextResponse.json({ success: true, action: 'deactivated' });
    }

    if (action === 'reactivate') {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('id', profileId);

      if (profileError) {
        throw new Error(`Failed to reactivate profile: ${profileError.message}`);
      }

      return NextResponse.json({ success: true, action: 'reactivated' });
    }

    if (action === 'change_role') {
      if (!role || !['admin', 'coordinator', 'madrich'].includes(role)) {
        return NextResponse.json(
          { error: 'Valid role (admin, coordinator, madrich) is required' },
          { status: 400 }
        );
      }

      // Update profile role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', profileId);

      if (profileError) {
        throw new Error(`Failed to change role: ${profileError.message}`);
      }

      // Update auth user metadata
      await supabase.auth.admin.updateUserById(profileId, {
        user_metadata: { role },
      });

      // If changing to admin, deactivate group memberships (admins don't have groups)
      if (role === 'admin') {
        await supabase
          .from('group_memberships')
          .update({ is_active: false })
          .eq('profile_id', profileId)
          .in('role', ['madrich', 'coordinator']);
      }

      // If changing from admin to coordinator/madrich and groupId provided, create membership
      if ((role === 'coordinator' || role === 'madrich') && groupId) {
        await supabase
          .from('group_memberships')
          .update({ is_active: false })
          .eq('profile_id', profileId)
          .in('role', ['madrich', 'coordinator']);

        await supabase.from('group_memberships').insert({
          profile_id: profileId,
          group_id: groupId,
          role,
          is_active: true,
        });
      }

      return NextResponse.json({ success: true, action: 'role_changed', newRole: role });
    }

    if (action === 'add_group') {
      if (!groupId) {
        return NextResponse.json({ error: 'groupId is required for add_group' }, { status: 400 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', profileId)
        .single();

      const membershipRole = profile?.role === 'coordinator' ? 'coordinator' : 'madrich';

      const { error: insertError } = await supabase.from('group_memberships').insert({
        profile_id: profileId,
        group_id: groupId,
        role: membershipRole,
        is_active: true,
      });

      if (insertError) {
        throw new Error(`Failed to add group: ${insertError.message}`);
      }

      return NextResponse.json({ success: true, action: 'group_added' });
    }

    if (action === 'remove_group') {
      if (!groupId) {
        return NextResponse.json({ error: 'groupId is required for remove_group' }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from('group_memberships')
        .update({ is_active: false })
        .eq('profile_id', profileId)
        .eq('group_id', groupId)
        .in('role', ['madrich', 'coordinator']);

      if (updateError) {
        throw new Error(`Failed to remove group: ${updateError.message}`);
      }

      return NextResponse.json({ success: true, action: 'group_removed' });
    }

    if (action === 'delete') {
      // Delete group memberships first
      await supabase
        .from('group_memberships')
        .delete()
        .eq('profile_id', profileId);

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId);

      if (profileError) {
        throw new Error(`Failed to delete profile: ${profileError.message}`);
      }

      // Delete auth user
      const { error: authError } = await supabase.auth.admin.deleteUser(profileId);

      if (authError) {
        throw new Error(`Failed to delete auth user: ${authError.message}`);
      }

      return NextResponse.json({ success: true, action: 'deleted' });
    }

    if (action === 'reset_password') {
      // Get user profile for last name to generate password
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_name')
        .eq('id', profileId)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const newPassword = generatePassword(profile.last_name);

      const { error: updateError } = await supabase.auth.admin.updateUserById(profileId, {
        password: newPassword,
      });

      if (updateError) {
        throw new Error(`Failed to reset password: ${updateError.message}`);
      }

      return NextResponse.json({ success: true, action: 'password_reset', generatedPassword: newPassword });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('User update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update user' },
      { status: 500 }
    );
  }
}
