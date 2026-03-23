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

    // Build membership map
    const membershipMap = new Map<
      string,
      {
        groupId: string;
        groupName: string;
        groupArea: string | null;
        membershipActive: boolean;
      }
    >();

    for (const m of memberships ?? []) {
      const group = m.groups as unknown as {
        id: string;
        name: string;
        slug: string;
        area: string | null;
      } | null;
      membershipMap.set(m.profile_id, {
        groupId: m.group_id,
        groupName: group?.name ?? 'Unknown',
        groupArea: group?.area ?? null,
        membershipActive: m.is_active,
      });
    }

    const allUsers = (profiles ?? []).map((p) => {
      const membership = membershipMap.get(p.id);
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: emailMap.get(p.id) ?? null,
        phone: p.phone,
        role: p.role as 'admin' | 'coordinator' | 'madrich',
        isActive: p.is_active ?? true,
        groupId: membership?.groupId ?? null,
        groupName: membership?.groupName ?? null,
        groupArea: membership?.groupArea ?? null,
        membershipActive: membership?.membershipActive ?? false,
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

    const { email, firstName, lastName, groupId, role } = await request.json();
    const userRole = role ?? 'madrich';

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'email, firstName, and lastName are required' },
        { status: 400 }
      );
    }

    // coordinator and madrich require a group
    if ((userRole === 'coordinator' || userRole === 'madrich') && !groupId) {
      return NextResponse.json(
        { error: 'groupId is required for coordinator and madrich roles' },
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

    // 3. Create group membership (for coordinator and madrich)
    if ((userRole === 'coordinator' || userRole === 'madrich') && groupId) {
      const { error: membershipError } = await supabase.from('group_memberships').insert({
        profile_id: userId,
        group_id: groupId,
        role: userRole,
        is_active: true,
      });

      if (membershipError) {
        throw new Error(`Failed to assign group: ${membershipError.message}`);
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
        groupId: groupId ?? null,
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('User update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update user' },
      { status: 500 }
    );
  }
}
