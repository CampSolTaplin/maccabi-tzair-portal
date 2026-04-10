import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_PASSWORD } from '@/lib/auth/default-password';

/**
 * Authenticated endpoint used by /change-password to set a new password
 * for the current user. Runs through the admin client so we can update
 * the password and merge `must_change_password: false` into user_metadata
 * in a single round-trip (the user-scoped updateUser API replaces
 * metadata instead of merging).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const newPassword =
      typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (newPassword === DEFAULT_PASSWORD) {
      return NextResponse.json(
        { error: 'Please choose a password different from the default.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const mergedMetadata = {
      ...(user.user_metadata ?? {}),
      must_change_password: false,
    };

    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        user_metadata: mergedMetadata,
      }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('change-password error:', err);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
