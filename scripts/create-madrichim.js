const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://oseauvhnjjzhcscqwvfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs'
);

const SLUGS = {
  '1st grade':'katan-1st','1st Grade':'katan-1st','2nd Grade':'katan-2nd',
  '3rd Grade':'katan-3rd','4th Grade':'katan-4th','5th Grade':'katan-5th',
  '5th grade':'katan-5th','6th Grade':'noar-6th','7th Grade':'noar-7th',
  '8th Grade':'noar-8th','Keff':'keff','Kinder':'katan-kinder',
};

const MADRICHIM = [
  {first:'Melanie',last:'Benlolo',group:'1st grade',gender:'Female',email:null},
  {first:'Harry',last:'Waich',group:'1st grade',gender:'Male',email:null},
  {first:'Sebastian',last:'Ceballos',group:'1st Grade',gender:'Male',email:null},
  {first:'Ben',last:'Lumer',group:'1st Grade',gender:'Male',email:'benlumer@icloud.com'},
  {first:'Sarah',last:'Coriat',group:'1st Grade',gender:'Female',email:'sarahcoriat@icloud.com'},
  {first:'Victoria',last:'Ioannou',group:'2nd Grade',gender:'Female',email:'tori.ioannou@icloud.com'},
  {first:'Fiorella',last:'Funes',group:'2nd Grade',gender:null,email:'fiorellafunes@icloud.com'},
  {first:'Sebastian',last:'Sommer',group:'2nd Grade',gender:'Male',email:null},
  {first:'Joshua',last:'Perlman',group:'2nd Grade',gender:'Male',email:null},
  {first:'Amos',last:'Cohen',group:'2nd Grade',gender:'Male',email:null},
  {first:'Luca',last:'Levy Mayo',group:'3rd Grade',gender:null,email:'lulevymayo@gmail.com'},
  {first:'Dan',last:'Nusynkier',group:'3rd Grade',gender:'Male',email:null},
  {first:'Maya',last:'Silberwasser',group:'3rd Grade',gender:'Female',email:null},
  {first:'Ilan',last:'Rojkes',group:'3rd Grade',gender:null,email:null},
  {first:'Vicky',last:'Zelerstein',group:'3rd Grade',gender:null,email:null},
  {first:'Ariela',last:'Gutt',group:'4th Grade',gender:'Female',email:null},
  {first:'Tomas',last:'Fleichman',group:'4th Grade',gender:'Male',email:null},
  {first:'Gabriel',last:'Klinger',group:'4th Grade',gender:'Male',email:null},
  {first:'Aaron',last:'Frost',group:'4th Grade',gender:'Male',email:null},
  {first:'Valen',last:'Beigun',group:'4th Grade',gender:null,email:null},
  {first:'Daniel',last:'Singer',group:'5th Grade',gender:'Male',email:'dssinger711@gmail.com'},
  {first:'Daniela',last:'Kliksberg',group:'5th grade',gender:null,email:'danielakliksberg@gmail.com'},
  {first:'Jeremias',last:'Popritkin',group:'5th Grade',gender:'Male',email:null},
  {first:'Sydney',last:'Markovich',group:'5th Grade',gender:'Female',email:null},
  {first:'Anael',last:'Haratz',group:'5th Grade',gender:'Female',email:'anaelharatz1@gmail.com'},
  {first:'Sol',last:'Fiure',group:'5th Grade',gender:'Female',email:'sol.fiure@gmail.com'},
  {first:'Thiago',last:'Bendel',group:'5th Grade',gender:'Male',email:null},
  {first:'Jack',last:'Toledano',group:'6th Grade',gender:'Male',email:null},
  {first:'Rafael',last:'Chabberman',group:'6th Grade',gender:null,email:null},
  {first:'Joseph',last:'Szapiro',group:'6th Grade',gender:'Male',email:'yosiszapiro@gmail.com'},
  {first:'Lorenzo',last:'Wainer',group:'6th Grade',gender:'Male',email:'lolowainer1@icloud.com'},
  {first:'Ulises',last:'Telias',group:'6th Grade',gender:'Male',email:'ulisestelias38@gmail.com'},
  {first:'Celine',last:'Elias',group:'6th Grade',gender:'Female',email:null},
  {first:'Lara',last:'Resnik',group:'6th Grade',gender:'Female',email:'laramresnik@gmail.com'},
  {first:'Uriel',last:'Lustgarten',group:'6th Grade',gender:'Male',email:null},
  {first:'Ace',last:'Stein',group:'7th Grade',gender:'Male',email:null},
  {first:'Andres',last:'Grosskopf',group:'7th Grade',gender:'Male',email:'andresgrosskopf47@gmail.com'},
  {first:'Carlos',last:'Atri',group:'7th Grade',gender:'Male',email:null},
  {first:'Israel',last:'Fischer',group:'7th Grade',gender:'Male',email:'israelfischerk@icloud.com'},
  {first:'Andrea',last:'Chocron',group:'7th Grade',gender:'Female',email:null},
  {first:'Sofia',last:'Starkand',group:'7th Grade',gender:'Female',email:null},
  {first:'Emily',last:'Waich',group:'7th Grade',gender:'Female',email:'emiwaich22@gmail.com'},
  {first:'Martin',last:'Segal',group:'8th Grade',gender:null,email:null},
  {first:'Jaime',last:'Gampel',group:'8th Grade',gender:'Male',email:null},
  {first:'Dylan',last:'Gorlovezky',group:'8th Grade',gender:'Male',email:null},
  {first:'Dana',last:'Shiro',group:'8th Grade',gender:'Female',email:null},
  {first:'Emma',last:'Benzaquen',group:'8th Grade',gender:'Female',email:null},
  {first:'Alejandro',last:'Ceballos',group:'8th Grade',gender:'Male',email:null},
  {first:'Alexandra',last:'Benaim',group:'8th Grade',gender:'Female',email:'alestarlol@icloud.com'},
  {first:'Manuel',last:'Gallone',group:'8th Grade',gender:'Male',email:'manugallone@icloud.com'},
  {first:'Alan',last:'Agay',group:'Keff',gender:'Male',email:null},
  {first:'Nicholas',last:'Golod',group:'Keff',gender:'Male',email:null},
  {first:'Liam',last:'Gorlovetzky',group:'Keff',gender:null,email:null},
  {first:'Eliot',last:'Carciente',group:'Keff',gender:null,email:null},
  {first:'Tobias',last:'Kaplan',group:'Keff',gender:'Male',email:null},
  {first:'Jake',last:'Szapiro',group:'Keff',gender:'Male',email:null},
  {first:'Franco',last:'Rochman',group:'Keff',gender:'Male',email:'francorochman@gmail.com'},
  {first:'Alan',last:'Kizer',group:'Keff',gender:'Male',email:'alankizer09@icloud.com'},
  {first:'Dana',last:'Horowitz',group:'Keff',gender:'Female',email:null},
  {first:'Alex',last:'Horowitz',group:'Keff',gender:'Male',email:null},
  {first:'Matthew',last:'Tulman',group:'Keff',gender:'Male',email:'matthewtulman@gmail.com'},
  {first:'Ariela',last:'Rozenblyum',group:'Keff',gender:null,email:'ariela.rozenb@icloud.com'},
  {first:'Maya',last:'Bloch',group:'Keff',gender:'Female',email:'mbloch0420@gmail.com'},
  {first:'Emmanuel',last:'Bukschtein',group:'Kinder',gender:null,email:null},
  {first:'Catalina',last:'Khane',group:'Kinder',gender:null,email:null},
  {first:'Danae',last:'Szkolnik',group:'Kinder',gender:null,email:'danaeszkolnik@gmail.com'},
  {first:'Natasha',last:'Furman',group:'Kinder',gender:null,email:'natashafurmanr@gmail.com'},
];

function genPassword(last) {
  const l = last.replace(/\s+/g, '');
  return 'Mtz' + l.charAt(0).toUpperCase() + l.slice(1, 3).toLowerCase() + '2026!';
}

async function run() {
  const { data: groups } = await supabase.from('groups').select('id, slug');
  const groupMap = new Map();
  for (const g of groups || []) groupMap.set(g.slug, g.id);

  const results = [];
  let ok = 0, err = 0;

  for (const m of MADRICHIM) {
    const slug = SLUGS[m.group];
    const groupId = groupMap.get(slug);
    if (!groupId) { console.log('Group not found:', m.group, slug); err++; continue; }

    const email = m.email || (m.first.toLowerCase() + '.' + m.last.toLowerCase().replace(/\s+/g, '') + '@mtz.marjcc.org');
    const password = genPassword(m.last);

    // Create auth user
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: m.first, last_name: m.last, role: 'madrich' },
    });

    if (authErr) {
      if (authErr.message.includes('already been registered')) {
        console.log('⚠ Auth exists:', email, '- skipping');
        results.push({ name: m.first + ' ' + m.last, email, password, group: m.group, status: 'exists' });
        ok++;
      } else {
        console.log('✗ Auth error:', m.first, m.last, authErr.message);
        err++;
      }
      continue;
    }

    const userId = authUser.user.id;

    // Create profile
    const { error: pErr } = await supabase.from('profiles').upsert({
      id: userId,
      first_name: m.first,
      last_name: m.last,
      role: 'madrich',
      gender: m.gender,
      grade: '11',
      is_active: true,
    }, { onConflict: 'id' });

    if (pErr) console.log('✗ Profile error:', m.first, m.last, pErr.message);

    // Create membership as madrich in assigned group
    const { error: mErr } = await supabase.from('group_memberships').insert({
      profile_id: userId,
      group_id: groupId,
      role: 'madrich',
      is_active: true,
    });

    if (mErr && !mErr.message.includes('duplicate')) {
      console.log('✗ Membership error:', m.first, m.last, mErr.message);
    }

    results.push({ name: m.first + ' ' + m.last, email, password, group: m.group, status: 'created' });
    ok++;
  }

  console.log('\n=== CREDENTIALS TABLE ===');
  console.log('Name | Email | Password | Group');
  console.log('---|---|---|---');
  for (const r of results) {
    console.log(r.name + ' | ' + r.email + ' | ' + r.password + ' | ' + r.group);
  }
  console.log('\nCreated:', ok, 'Errors:', err);
}

run().catch(console.error);
