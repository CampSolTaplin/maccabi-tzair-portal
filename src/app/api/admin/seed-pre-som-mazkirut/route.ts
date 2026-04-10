import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_PASSWORD } from '@/lib/auth/default-password';
import { normalizeUSPhone } from '@/lib/auth/phone';

/**
 * One-shot admin endpoint that creates the Pre-SOM mazkirut group members.
 * Equivalent to scripts/create-pre-som-mazkirut.js but callable from the
 * admin UI so the user doesn't have to run anything in a terminal.
 *
 * Idempotent: skips any user whose normalized phone already exists in
 * profiles.phone (tries both new E.164 and legacy 10-digit formats).
 */

const PRE_SOM_SLUG = 'pre-som';

const MAZKIRUT: Array<{ first: string; last: string; phone: string }> = [
  { first: 'Dan',        last: 'Berlagosky',    phone: '9543837014' },
  { first: 'Elizabeth',  last: 'Bakalarz',      phone: '3059045816' },
  { first: 'Ilana',      last: 'Levy',          phone: '7862969954' },
  { first: 'Joel',       last: 'Feldman',       phone: '3057331802' },
  { first: 'Maya',       last: 'Hunis',         phone: '9546095000' },
  { first: 'Mia',        last: 'Rebruj',        phone: '7866135473' },
  { first: 'Milla',      last: 'Szprynger',     phone: '3053107251' },
  { first: 'Noah',       last: 'Mizrachi',      phone: '7865909955' },
  { first: 'Valentina',  last: 'Chmielewski',   phone: '7862137020' },
];

function syntheticEmail(): string {
  return `phone-${Math.random().toString(36).slice(2, 12)}@mtz.local`;
}

export async function POST() {
  // Auth: must be an admin (not a coordinator)
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  // 1. Look up the Pre-SOM group
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, name')
    .eq('slug', PRE_SOM_SLUG)
    .single();

  if (groupErr || !group) {
    return NextResponse.json(
      { error: `Pre-SOM group (slug: ${PRE_SOM_SLUG}) not found` },
      { status: 500 }
    );
  }

  const created: Array<{ name: string; phone: string }> = [];
  const skipped: Array<{ name: string; phone: string; reason: string }> = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const person of MAZKIRUT) {
    const label = `${person.first} ${person.last}`;

    const phone = normalizeUSPhone(person.phone);
    if (!phone) {
      failed.push({ name: label, reason: `Invalid phone "${person.phone}"` });
      continue;
    }

    // Skip if some profile already has this phone (match both formats)
    const tenDigit = phone.replace(/^\+1/, '');
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .or(`phone.eq.${phone},phone.eq.${tenDigit}`)
      .maybeSingle();

    if (existing) {
      skipped.push({
        name: label,
        phone,
        reason: `Phone already used by ${existing.first_name} ${existing.last_name}`,
      });
      continue;
    }

    // 2. Create auth user with a synthetic email + default password + must-change flag
    const email = syntheticEmail();
    const { data: authData, error: authErr } =
      await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          role: 'mazkirut',
          first_name: person.first,
          last_name: person.last,
          must_change_password: true,
        },
      });

    if (authErr || !authData?.user) {
      failed.push({
        name: label,
        reason: authErr?.message ?? 'createUser returned no user',
      });
      continue;
    }

    const userId = authData.user.id;

    // 3. Upsert profile with phone
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        first_name: person.first,
        last_name: person.last,
        role: 'mazkirut',
        phone,
        is_active: true,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      failed.push({ name: label, reason: profileError.message });
      continue;
    }

    // 4. Assign to Pre-SOM group
    const { error: membershipError } = await supabase
      .from('group_memberships')
      .insert({
        profile_id: userId,
        group_id: group.id,
        role: 'mazkirut',
        is_active: true,
      });

    if (membershipError) {
      failed.push({ name: label, reason: membershipError.message });
      continue;
    }

    created.push({ name: label, phone });
  }

  return NextResponse.json({
    ok: true,
    group: group.name,
    defaultPassword: DEFAULT_PASSWORD,
    created,
    skipped,
    failed,
  });
}
