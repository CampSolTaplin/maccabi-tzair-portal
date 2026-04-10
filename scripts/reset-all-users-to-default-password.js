/* eslint-disable */
/**
 * BACKFILL: reset every auth.users row to the shared default password
 * and re-arm the must_change_password flag so everyone is forced to
 * choose a new password on their next login.
 *
 * This is a destructive, one-shot operation that will lock out anyone
 * who doesn't know the default password, including you. Run it only
 * when you're ready to announce the change to the whole team.
 *
 * Safety: refuses to run without the --confirm flag.
 *
 *   node scripts/reset-all-users-to-default-password.js              # dry run
 *   node scripts/reset-all-users-to-default-password.js --confirm    # actually do it
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://oseauvhnjjzhcscqwvfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs'
);

const DEFAULT_PASSWORD = 'M@rjcc2026';
const PAGE_SIZE = 200;

const confirm = process.argv.includes('--confirm');

async function listAllUsers() {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const batch = data?.users ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

async function main() {
  console.log('== Backfill: reset all users to default password ==');
  if (!confirm) {
    console.log('\n⚠️  Running in DRY RUN mode. No changes will be made.');
    console.log('   Re-run with --confirm to actually reset passwords.\n');
  } else {
    console.log('\n🔴 LIVE MODE. Every user will be reset in a few seconds...\n');
    await new Promise((r) => setTimeout(r, 3000));
  }

  const users = await listAllUsers();
  console.log(`Found ${users.length} users in auth.users`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  for (const user of users) {
    const label = `${user.email || user.phone || user.id}`;

    if (!confirm) {
      console.log(`  [dry] would reset ${label}`);
      skipped += 1;
      continue;
    }

    const mergedMetadata = {
      ...(user.user_metadata ?? {}),
      must_change_password: true,
    };

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: DEFAULT_PASSWORD,
      user_metadata: mergedMetadata,
    });

    if (error) {
      console.error(`  ❌ ${label}: ${error.message}`);
      failed += 1;
      errors.push({ id: user.id, label, error: error.message });
    } else {
      console.log(`  ✅ ${label}`);
      succeeded += 1;
    }
  }

  console.log('\n========= SUMMARY =========');
  console.log(`Total users:      ${users.length}`);
  if (confirm) {
    console.log(`Reset succeeded:  ${succeeded}`);
    console.log(`Reset failed:     ${failed}`);
  } else {
    console.log(`Would reset:      ${skipped}`);
  }

  if (errors.length > 0) {
    console.log('\nFailed users:');
    for (const e of errors) {
      console.log(`  - ${e.label}: ${e.error}`);
    }
  }

  if (confirm && succeeded > 0) {
    console.log(
      `\nDone. Everyone now has password: ${DEFAULT_PASSWORD}`
    );
    console.log(
      'They will be forced to pick a new password the next time they log in.'
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
