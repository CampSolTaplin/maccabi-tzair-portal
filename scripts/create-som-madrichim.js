const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://oseauvhnjjzhcscqwvfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs'
);

const SOM_GROUP_ID = 'd7ae03e3-376c-4e2e-ae0b-f0f81b8f8ecb';

const MADRICHIM = [
  { first: 'Elias', last: 'Levy', email: 'elevykorine@gmail.com', phone: '7866671852', dob: '2007-10-29' },
  { first: 'David', last: 'Bentolila', email: 'davidbentolila2008@gmail.com', phone: '7548027346', dob: '2008-01-10' },
  { first: 'Adrian', last: 'Cohen', email: 'adrianjkcc@gmail.com', phone: '3053232586', dob: '2008-02-07' },
  { first: 'Camila', last: 'Cohen', email: 'camicohen08@gmail.com', phone: '7866204197', dob: '2008-02-25' },
  { first: 'Daniela', last: 'Jason', email: 'danielajason308@gmail.com', phone: '7865088572', dob: '2008-03-13' },
  { first: 'Tali', last: 'Chocron', email: 'talichoc@icloud.com', phone: '7867476995', dob: '2008-06-02' },
  { first: 'Simon', last: 'Tchira', email: 'simontchira@gmail.com', phone: '7866619623', dob: '2008-07-21' },
  { first: 'Jaia', last: 'Herdan', email: 'jaiaherdan@gmail.com', phone: '3056150884', dob: '2008-08-05' },
  { first: 'Sophie', last: 'Small', email: 'ssophiesmall@gmail.com', phone: '7867698549', dob: '2008-10-02' },
];

// Generate a simple initial password: Mtz + first 3 letters of last name + birth year
function makePassword(m) {
  return 'Mtz' + m.last.slice(0, 3) + m.dob.slice(0, 4) + '!';
}

async function run() {
  const results = [];

  for (const m of MADRICHIM) {
    const password = makePassword(m);
    console.log(`\nProcessing ${m.first} ${m.last} (${m.email})...`);

    // 1. Create auth user
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: m.email,
      password,
      email_confirm: true, // Skip email verification
      user_metadata: {
        first_name: m.first,
        last_name: m.last,
      },
    });

    if (authErr) {
      // If user already exists, try to find them
      if (authErr.message.includes('already been registered') || authErr.message.includes('already exists')) {
        console.log(`  User already exists, looking up...`);
        const { data: { users } } = await sb.auth.admin.listUsers();
        const existing = users.find(u => u.email === m.email);
        if (existing) {
          console.log(`  Found existing user: ${existing.id}`);
          // Update their profile
          await updateProfile(existing.id, m);
          await assignGroup(existing.id);
          results.push({ name: `${m.first} ${m.last}`, email: m.email, password, status: 'existing-updated' });
          continue;
        }
      }
      console.error(`  ERROR creating auth user: ${authErr.message}`);
      results.push({ name: `${m.first} ${m.last}`, email: m.email, password, status: `error: ${authErr.message}` });
      continue;
    }

    const userId = authData.user.id;
    console.log(`  Auth user created: ${userId}`);

    // 2. Create/update profile
    await updateProfile(userId, m);

    // 3. Assign to SOM group
    await assignGroup(userId);

    results.push({ name: `${m.first} ${m.last}`, email: m.email, password, status: 'created' });
  }

  console.log('\n\n========== RESULTS ==========\n');
  console.log('Name | Email | Password | Status');
  console.log('-'.repeat(80));
  for (const r of results) {
    console.log(`${r.name} | ${r.email} | ${r.password} | ${r.status}`);
  }
  console.log('\n=============================\n');
}

async function updateProfile(userId, m) {
  const { error } = await sb.from('profiles').upsert({
    id: userId,
    first_name: m.first,
    last_name: m.last,
    role: 'madrich',
    phone: m.phone,
    birthdate: m.dob,
    is_active: true,
  }, { onConflict: 'id' });

  if (error) {
    console.error(`  ERROR updating profile: ${error.message}`);
  } else {
    console.log(`  Profile updated (role: madrich)`);
  }
}

async function assignGroup(userId) {
  const { error } = await sb.from('group_memberships').upsert({
    profile_id: userId,
    group_id: SOM_GROUP_ID,
    role: 'madrich',
    is_active: true,
    joined_at: new Date().toISOString().split('T')[0],
  }, { onConflict: 'profile_id,group_id,role' });

  if (error) {
    console.error(`  ERROR assigning group: ${error.message}`);
  } else {
    console.log(`  Assigned to SOM group as madrich`);
  }
}

run().catch(console.error);
