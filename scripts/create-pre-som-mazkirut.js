/* eslint-disable */
/**
 * One-shot script to create the Pre-SOM mazkirut. These users are phone-only
 * (no email), so each one gets a synthetic internal email under the hood and
 * logs in with their phone number via /api/auth/resolve-phone.
 *
 * Run once with:  node scripts/create-pre-som-mazkirut.js
 *
 * Safe to re-run — it skips any user whose normalized phone already exists
 * in profiles.phone.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://oseauvhnjjzhcscqwvfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs'
);

const PRE_SOM_SLUG = 'pre-som';
const DEFAULT_PASSWORD = 'M@rjcc2026';

const MAZKIRUT = [
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

function normalizeUSPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function syntheticEmail() {
  return `phone-${Math.random().toString(36).slice(2, 12)}@mtz.local`;
}

async function main() {
  // 1. Look up the Pre-SOM group
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, name, slug')
    .eq('slug', PRE_SOM_SLUG)
    .single();

  if (groupErr || !group) {
    console.error('Could not find Pre-SOM group (slug: pre-som):', groupErr);
    process.exit(1);
  }

  console.log(`Found group: ${group.name} (${group.id})\n`);

  const created = [];
  const skipped = [];
  const failed = [];

  for (const person of MAZKIRUT) {
    const label = `${person.first} ${person.last}`;

    const phone = normalizeUSPhone(person.phone);
    if (!phone) {
      console.error(`❌ ${label}: invalid phone "${person.phone}"`);
      failed.push({ ...person, reason: 'invalid phone' });
      continue;
    }

    // Skip if another profile already has this phone (check both new and legacy formats)
    const tenDigit = phone.replace(/^\+1/, '');
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .or(`phone.eq.${phone},phone.eq.${tenDigit}`)
      .maybeSingle();

    if (existing) {
      console.log(`⏭  ${label}: phone already used by ${existing.first_name} ${existing.last_name}`);
      skipped.push({ ...person, phone, reason: 'duplicate phone' });
      continue;
    }

    // 2. Create auth user with a synthetic email
    const email = syntheticEmail();

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
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
      console.error(`❌ ${label}: failed to create auth user — ${authErr?.message}`);
      failed.push({ ...person, reason: authErr?.message });
      continue;
    }

    const userId = authData.user.id;

    // 3. Upsert profile with the phone (the handle_new_user trigger may have
    //    already created a bare profile row)
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          first_name: person.first,
          last_name: person.last,
          role: 'mazkirut',
          phone: phone,
          is_active: true,
        },
        { onConflict: 'id' }
      );

    if (profileErr) {
      console.error(`❌ ${label}: failed to upsert profile — ${profileErr.message}`);
      failed.push({ ...person, reason: profileErr.message });
      continue;
    }

    // 4. Add to Pre-SOM group membership
    const { error: membershipErr } = await supabase
      .from('group_memberships')
      .insert({
        profile_id: userId,
        group_id: group.id,
        role: 'mazkirut',
        is_active: true,
      });

    if (membershipErr) {
      console.error(`❌ ${label}: failed to assign group — ${membershipErr.message}`);
      failed.push({ ...person, reason: membershipErr.message });
      continue;
    }

    console.log(`✅ ${label} — ${phone}`);
    created.push({ name: label, phone });
  }

  // Summary
  console.log('\n========= SUMMARY =========');
  console.log(`Created: ${created.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Failed:  ${failed.length}`);

  if (created.length > 0) {
    console.log(`\nAll new users share the default password: ${DEFAULT_PASSWORD}`);
    console.log('They will be prompted to change it on first login.\n');
    console.log('Name                            Phone');
    console.log('-------------------------------------------------');
    for (const r of created) {
      console.log(`${r.name.padEnd(32)}${r.phone}`);
    }
  }

  if (failed.length > 0) {
    console.log('\n========= FAILED =========');
    for (const f of failed) {
      console.log(`- ${f.first} ${f.last}: ${f.reason}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
