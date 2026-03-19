const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://oseauvhnjjzhcscqwvfc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs'
);
const SCHOOL_MAP = {'hillel':'Scheck Hillel Community School','scheck hillel':'Scheck Hillel Community School','scheck hillel community school':'Scheck Hillel Community School','ben gamla':'Ben Gamla Charter School','ben gamla charter school':'Ben Gamla Charter School','posnack':'David Posnack Jewish Day School','posnack school':'David Posnack Jewish Day School','david posnack jewish day school':'David Posnack Jewish Day School','aces':'Aventura City of Excellence School','aventura city of excellence school':'Aventura City of Excellence School','krop':'Krop Senior High','kropp':'Krop Senior High','don soffer':'Don Soffer Aventura High School','don soffer aventura high school':'Don Soffer Aventura High School','nsu':'NSU University School','nsu university school':'NSU University School','nova university school':'NSU University School','highland oaks':'Highland Oaks','highland oaks elementary':'Highland Oaks','highland oaks middle':'Highland Oaks','pine crest':'Pine Crest School','pine crest school':'Pine Crest School','pinecrest':'Pine Crest School','aventura waterways':'Aventura Waterways K-8','aventura waterways k-8':'Aventura Waterways K-8','jla':'Jewish Leadership Academy','hom':'Hebrew of Miami','hebrew of miami':'Hebrew of Miami','ruth k broad':'Ruth K. Broad Bay Harbor K-8','bridgeprep':'BridgePrep Academy','beachside montessori':'Beachside Montessori Village','beachside montessori village':'Beachside Montessori Village','vabhoe':'VABHOE'};
const NO_ALLERGY = new Set(['no','n/a','na','none','no.','nope','no allergies','non','no known allergies','ninguna','n','-','no tiene','nothing']);
async function run() {
  const path = process.argv[2];
  if (!path) { console.log('Usage: node scripts/post-import-cleanup.js <xlsx>'); process.exit(1); }
  const wb = XLSX.readFile(path);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const m = new Map();
  for (const r of rows) { const c = r['Contact: Contact ID']; if (c && !m.has(c)) m.set(c, r); }
  console.log('Processing ' + m.size + ' contacts...');
  let ok = 0, err = 0;
  for (const [cid, r] of m) {
    let school = r['Contact: School'] ? String(r['Contact: School']).trim() : null;
    if (school) { const n = SCHOOL_MAP[school.toLowerCase()]; if (n) school = n; }
    let allergies = r['Contact: Allergies'] ? String(r['Contact: Allergies']).trim() : null;
    if (allergies && NO_ALLERGY.has(allergies.toLowerCase())) allergies = null;
    const { error } = await supabase.from('profiles').update({
      school, allergies,
      parent_name: r['Registration: Account: Account Name'] || null,
      parent_email: r['Registration: Account: Primary Contact Email'] || null,
      parent_phone: r['Registration: Account: Phone'] ? String(r['Registration: Account: Phone']) : null,
      emergency_contact_name: r['Registration: Account: Emergency Contact 1 Name'] || null,
      emergency_contact_phone: r['Registration: Account: Emergency Contact 1 Cell Phone'] ? String(r['Registration: Account: Emergency Contact 1 Cell Phone']) : null,
      family_name: r['Registration: Account: Account Name'] || null,
    }).eq('salesforce_contact_id', cid);
    if (error) { err++; } else { ok++; }
  }
  console.log('Done! Updated: ' + ok + ', Errors: ' + err);
}
run().catch(console.error);
