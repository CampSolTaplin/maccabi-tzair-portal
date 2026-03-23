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

/* ─── GET: list all madrichim ─── */

export async function GET() {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    // Get all profiles with role=madrich (including inactive)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, phone, is_active')
      .eq('role', 'madrich')
      .order('last_name');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Get group memberships for madrichim
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
      .eq('role', 'madrich');

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

    const madrichim = (profiles ?? []).map((p) => {
      const membership = membershipMap.get(p.id);
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: emailMap.get(p.id) ?? null,
        phone: p.phone,
        isActive: p.is_active ?? true,
        groupId: membership?.groupId ?? null,
        groupName: membership?.groupName ?? null,
        groupArea: membership?.groupArea ?? null,
        membershipActive: membership?.membershipActive ?? false,
      };
    });

    return NextResponse.json({ madrichim });
  } catch (err) {
    console.error('Madrichim fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch madrichim' },
      { status: 500 }
    );
  }
}

/* ─── POST: create new madrich ─── */

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    const { email, firstName, lastName, groupId } = await request.json();

    if (!email || !firstName || !lastName || !groupId) {
      return NextResponse.json(
        { error: 'email, firstName, lastName, and groupId are required' },
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
        role: 'madrich',
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
        role: 'madrich',
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // 3. Create group membership
    const { error: membershipError } = await supabase.from('group_memberships').insert({
      profile_id: userId,
      group_id: groupId,
      role: 'madrich',
      is_active: true,
    });

    if (membershipError) {
      throw new Error(`Failed to assign group: ${membershipError.message}`);
    }

    return NextResponse.json({
      success: true,
      madrich: {
        id: userId,
        email,
        firstName,
        lastName,
        groupId,
        generatedPassword: password,
      },
    });
  } catch (err) {
    console.error('Madrich creation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create madrich' },
      { status: 500 }
    );
  }
}

/* ─── PATCH: update group assignment or deactivate ─── */

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    const { profileId, action, groupId } = await request.json();

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

      // Deactivate existing madrich memberships for this profile
      await supabase
        .from('group_memberships')
        .update({ is_active: false })
        .eq('profile_id', profileId)
        .eq('role', 'madrich');

      // Insert new active membership
      const { error: insertError } = await supabase.from('group_memberships').insert({
        profile_id: profileId,
        group_id: groupId,
        role: 'madrich',
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
        .eq('role', 'madrich');

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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Madrich update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update madrich' },
      { status: 500 }
    );
  }
}
