import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_PASSWORD } from '@/lib/auth/default-password';

/**
 * Bulk backfill: paginate through every auth.users row and set them to
 * the shared default password with must_change_password re-armed so the
 * whole team is forced to pick a new password on their next login.
 *
 * Admin-only. Destructive. Intended to be called once from the
 * /admin/madrichim "Danger Zone" button.
 */
export async function POST() {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Only real admins can run this. Coordinators cannot.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  try {
    const PAGE_SIZE = 200;
    let page = 1;
    let total = 0;
    let succeeded = 0;
    let failed = 0;
    const errors: { id: string; label: string; error: string }[] = [];

    while (true) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      });
      if (listError) {
        throw new Error(`listUsers failed: ${listError.message}`);
      }
      const batch = data?.users ?? [];
      total += batch.length;

      for (const u of batch) {
        const label = u.email || u.phone || u.id;
        const mergedMetadata = {
          ...(u.user_metadata ?? {}),
          must_change_password: true,
        };

        const { error: updateError } = await supabase.auth.admin.updateUserById(
          u.id,
          {
            password: DEFAULT_PASSWORD,
            user_metadata: mergedMetadata,
          }
        );

        if (updateError) {
          failed += 1;
          errors.push({ id: u.id, label, error: updateError.message });
        } else {
          succeeded += 1;
        }
      }

      if (batch.length < PAGE_SIZE) break;
      page += 1;
    }

    return NextResponse.json({
      ok: true,
      total,
      succeeded,
      failed,
      errors: errors.slice(0, 20), // cap the error list so the response stays reasonable
    });
  } catch (err) {
    console.error('reset-all-passwords error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reset passwords' },
      { status: 500 }
    );
  }
}
