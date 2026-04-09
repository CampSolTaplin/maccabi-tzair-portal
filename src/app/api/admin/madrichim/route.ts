import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeUSPhone } from '@/lib/auth/phone';

const PHONE_LOGIN_ROLES = new Set(['madrich', 'mazkirut']);

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

  if (!profile || !['admin', 'coordinator'].includes(profile.role)) {
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

    // Check if current user is coordinator (to filter results)
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user!.id)
      .single();

    let coordinatorGroupIds: string[] | null = null;
    if (myProfile?.role === 'coordinator') {
      const { data: myMemberships } = await supabase
        .from('group_memberships')
        .select('group_id')
        .eq('profile_id', auth.user!.id)
        .eq('role', 'coordinator')
        .eq('is_active', true);
      coordinatorGroupIds = (myMemberships ?? []).map(m => m.group_id);
    }

    // Get profiles — coordinator only sees madrichim (not admin/coordinator)
    const rolesToFetch = coordinatorGroupIds ? ['madrich', 'mazkirut'] : ['admin', 'coordinator', 'madrich', 'mazkirut'];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, phone, is_active')
      .in('role', rolesToFetch)
      .order('role')
      .order('last_name');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Get group memberships for coordinator and madrich users
    let profileIds = (profiles ?? []).map((p) => p.id);

    // Coordinator: further filter to only madrichim in their groups
    if (coordinatorGroupIds) {
      const { data: groupMadrichim } = await supabase
        .from('group_memberships')
        .select('profile_id')
        .in('group_id', coordinatorGroupIds.length > 0 ? coordinatorGroupIds : ['__none__'])
        .in('role', ['madrich', 'mazkirut', 'coordinator'])
        .eq('is_active', true);
      const allowedIds = new Set((groupMadrichim ?? []).map(m => m.profile_id));
      profileIds = profileIds.filter(id => allowedIds.has(id));
    }
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
      .in('role', ['madrich', 'mazkirut', 'coordinator']);

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

    // Filter profiles by allowed IDs (for coordinator)
    const filteredProfiles = coordinatorGroupIds
      ? (profiles ?? []).filter(p => profileIds.includes(p.id))
      : (profiles ?? []);

    const allUsers = filteredProfiles.map((p) => {
      const groups = membershipMap.get(p.id) ?? [];
      const first = groups[0] ?? null;
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: emailMap.get(p.id) ?? null,
        phone: p.phone,
        role: p.role as 'admin' | 'coordinator' | 'madrich' | 'mazkirut',
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

    const { email, phone, firstName, lastName, groupId, groupIds, role } = await request.json();
    const userRole = role ?? 'madrich';

    // Coordinators and mazkirut can receive groupIds array; madrichim use single groupId
    const resolvedGroupIds: string[] =
      (userRole === 'coordinator' || userRole === 'mazkirut') && Array.isArray(groupIds) && groupIds.length > 0
        ? groupIds
        : groupId
          ? [groupId]
          : [];

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'firstName and lastName are required' },
        { status: 400 }
      );
    }

    // Phone login is only available for madrich and mazkirut. All other roles
    // (admin, coordinator) must be created with an email.
    const cleanEmail: string | null =
      typeof email === 'string' && email.trim().length > 0 ? email.trim() : null;

    let normalizedPhone: string | null = null;
    if (typeof phone === 'string' && phone.trim().length > 0) {
      if (!PHONE_LOGIN_ROLES.has(userRole)) {
        return NextResponse.json(
          { error: 'Phone login is only available for madrich and mazkirut roles' },
          { status: 400 }
        );
      }
      normalizedPhone = normalizeUSPhone(phone);
      if (!normalizedPhone) {
        return NextResponse.json(
          { error: 'Phone must be a valid 10-digit US number' },
          { status: 400 }
        );
      }
    }

    if (!cleanEmail && !normalizedPhone) {
      return NextResponse.json(
        { error: 'An email or phone number is required' },
        { status: 400 }
      );
    }

    // coordinator and madrich require at least one group
    if ((userRole === 'coordinator' || userRole === 'madrich' || userRole === 'mazkirut') && resolvedGroupIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one group is required for coordinator and madrich roles' },
        { status: 400 }
      );
    }

    if (!['admin', 'coordinator', 'madrich', 'mazkirut'].includes(userRole)) {
      return NextResponse.json(
        { error: 'role must be admin, coordinator, or madrich' },
        { status: 400 }
      );
    }

    const password = generatePassword(lastName);

    // 1. Create auth user
    const createPayload: {
      email?: string;
      phone?: string;
      password: string;
      email_confirm?: boolean;
      phone_confirm?: boolean;
      user_metadata: { role: string; first_name: string; last_name: string };
    } = {
      password,
      user_metadata: {
        role: userRole,
        first_name: firstName,
        last_name: lastName,
      },
    };
    if (cleanEmail) {
      createPayload.email = cleanEmail;
      createPayload.email_confirm = true;
    }
    if (normalizedPhone) {
      createPayload.phone = normalizedPhone;
      createPayload.phone_confirm = true;
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser(createPayload);

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
        phone: normalizedPhone,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // 3. Create group memberships (for coordinator and madrich)
    if ((userRole === 'coordinator' || userRole === 'madrich' || userRole === 'mazkirut') && resolvedGroupIds.length > 0) {
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

      const membershipRole = profile?.role === 'coordinator' ? 'coordinator' : profile?.role === 'mazkirut' ? 'mazkirut' : 'madrich';

      // Deactivate existing memberships for this profile
      await supabase
        .from('group_memberships')
        .update({ is_active: false })
        .eq('profile_id', profileId)
        .in('role', ['madrich', 'mazkirut', 'coordinator']);

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
        .in('role', ['madrich', 'mazkirut', 'coordinator']);

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
      if (!role || !['admin', 'coordinator', 'madrich', 'mazkirut'].includes(role)) {
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
          .in('role', ['madrich', 'mazkirut', 'coordinator']);
      }

      // If changing from admin to coordinator/madrich and groupId provided, create membership
      if ((role === 'coordinator' || role === 'madrich' || role === 'mazkirut') && groupId) {
        await supabase
          .from('group_memberships')
          .update({ is_active: false })
          .eq('profile_id', profileId)
          .in('role', ['madrich', 'mazkirut', 'coordinator']);

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

      const membershipRole = profile?.role === 'coordinator' ? 'coordinator' : profile?.role === 'mazkirut' ? 'mazkirut' : 'madrich';

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
        .in('role', ['madrich', 'mazkirut', 'coordinator']);

      if (updateError) {
        throw new Error(`Failed to remove group: ${updateError.message}`);
      }

      return NextResponse.json({ success: true, action: 'group_removed' });
    }

    if (action === 'update_profile') {
      const { firstName, lastName, phone, email } = await request.json();

      // If a phone was provided, normalize and validate it before touching
      // anything. We allow phone login only for madrich and mazkirut.
      let phoneForProfile: string | null | undefined;
      let phoneForAuth: string | null | undefined;
      if (typeof phone === 'string') {
        if (phone.trim().length === 0) {
          // Explicit clear
          phoneForProfile = null;
          phoneForAuth = null;
        } else {
          const { data: targetProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', profileId)
            .single();
          if (!targetProfile || !PHONE_LOGIN_ROLES.has(targetProfile.role)) {
            return NextResponse.json(
              { error: 'Phone login is only available for madrich and mazkirut roles' },
              { status: 400 }
            );
          }
          const normalized = normalizeUSPhone(phone);
          if (!normalized) {
            return NextResponse.json(
              { error: 'Phone must be a valid 10-digit US number' },
              { status: 400 }
            );
          }
          phoneForProfile = normalized;
          phoneForAuth = normalized;
        }
      }

      // Update profile fields
      const profileUpdate: Record<string, unknown> = {};
      if (firstName) profileUpdate.first_name = firstName;
      if (lastName) profileUpdate.last_name = lastName;
      if (phoneForProfile !== undefined) profileUpdate.phone = phoneForProfile;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', profileId);

        if (profileError) {
          throw new Error(`Failed to update profile: ${profileError.message}`);
        }
      }

      // Sync phone to auth.users so the user can log in with it.
      if (phoneForAuth !== undefined) {
        const { data: existingAuth } = await supabase.auth.admin.getUserById(profileId);
        if (existingAuth?.user) {
          const { error: phoneSyncError } = await supabase.auth.admin.updateUserById(profileId, {
            phone: phoneForAuth ?? '',
            phone_confirm: true,
          });
          if (phoneSyncError) {
            throw new Error(`Failed to sync phone to auth: ${phoneSyncError.message}`);
          }
        } else if (phoneForAuth) {
          // No auth user yet — create one with phone-only login.
          const currentProfile = await supabase
            .from('profiles')
            .select('last_name, role, first_name')
            .eq('id', profileId)
            .single();
          const generated = generatePassword(currentProfile.data?.last_name ?? 'user');
          const { error: createError } = await supabase.auth.admin.createUser({
            id: profileId,
            phone: phoneForAuth,
            password: generated,
            phone_confirm: true,
            user_metadata: {
              role: currentProfile.data?.role ?? 'madrich',
              first_name: currentProfile.data?.first_name ?? '',
              last_name: currentProfile.data?.last_name ?? '',
            },
          });
          if (createError) {
            throw new Error(`Failed to create auth account: ${createError.message}`);
          }
          await supabase
            .from('profiles')
            .update({ needs_email: false })
            .eq('id', profileId);
          return NextResponse.json({
            success: true,
            action: 'profile_updated',
            authCreated: true,
            generatedPassword: generated,
          });
        }
      }

      // Update auth user metadata (name)
      if (firstName || lastName) {
        const metaUpdate: Record<string, string> = {};
        if (firstName) metaUpdate.first_name = firstName;
        if (lastName) metaUpdate.last_name = lastName;
        await supabase.auth.admin.updateUserById(profileId, {
          user_metadata: metaUpdate,
        }).catch(() => {
          // Auth user might not exist (imported profile without email)
        });
      }

      // Handle email: if profile has no auth user, create one
      if (email) {
        // Check if auth user exists
        const { data: authUser } = await supabase.auth.admin.getUserById(profileId);

        if (authUser?.user) {
          // Auth user exists — update email
          const { error: emailError } = await supabase.auth.admin.updateUserById(profileId, {
            email,
            email_confirm: true,
          });
          if (emailError) {
            throw new Error(`Failed to update email: ${emailError.message}`);
          }
        } else {
          // No auth user — create one with this email
          const currentProfile = await supabase
            .from('profiles')
            .select('last_name, role')
            .eq('id', profileId)
            .single();

          const password = generatePassword(currentProfile.data?.last_name ?? 'user');

          const { error: createError } = await supabase.auth.admin.createUser({
            id: profileId,
            email,
            password,
            email_confirm: true,
            user_metadata: {
              role: currentProfile.data?.role ?? 'madrich',
              first_name: firstName ?? undefined,
              last_name: lastName ?? undefined,
            },
          });

          if (createError) {
            throw new Error(`Failed to create auth account: ${createError.message}`);
          }

          // Clear needs_email flag
          await supabase
            .from('profiles')
            .update({ needs_email: false })
            .eq('id', profileId);

          return NextResponse.json({
            success: true,
            action: 'profile_updated',
            authCreated: true,
            generatedPassword: password,
          });
        }
      }

      return NextResponse.json({ success: true, action: 'profile_updated' });
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
