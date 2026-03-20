import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, first_name, last_name, role,
        group_memberships!inner(group_id, groups(id, name, slug))
      `)
      .eq('role', 'madrich')
      .eq('group_memberships.role', 'madrich')
      .eq('group_memberships.is_active', true);

    if (error) {
      throw new Error(`Failed to fetch madrichim: ${error.message}`);
    }

    // Also get auth emails
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const emailMap = new Map(users.map((u) => [u.id, u.email]));

    const madrichim = (data ?? []).map((p) => {
      const membership = (p.group_memberships as unknown as Array<{
        group_id: string;
        groups: { id: string; name: string; slug: string } | null;
      }>)?.[0];
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: emailMap.get(p.id) ?? null,
        groupId: membership?.group_id ?? null,
        groupName: membership?.groups?.name ?? null,
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

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, groupId } = await request.json();

    if (!email || !password || !firstName || !lastName || !groupId) {
      return NextResponse.json(
        { error: 'email, password, firstName, lastName, and groupId are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Create auth user — the handle_new_user() trigger auto-creates the profile
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

    // 2. Insert group membership
    const { error: membershipError } = await supabase
      .from('group_memberships')
      .insert({
        profile_id: userId,
        group_id: groupId,
        role: 'madrich',
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
