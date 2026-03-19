const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://oseauvhnjjzhcscqwvfc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs');
async function run() {
  // First test a single update to see the error
  const { error: testErr } = await sb.from('profiles').update({ gender: 'Male' }).eq('salesforce_contact_id', '003Pa000019cXrh');
  if (testErr) {
    console.log('Test error:', testErr.message, testErr.code, testErr.details);
    // Try adding column via RPC if missing
    console.log('Trying to check if column exists...');
    const { data } = await sb.from('profiles').select('id').limit(1);
    console.log('Profile keys:', data ? Object.keys(data[0] || {}) : 'no data');
    return;
  }
  console.log('Test OK, proceeding with full update...');
  const wb = XLSX.readFile(process.argv[2]);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const m = new Map();
  for (const r of rows) { const c = r['Contact: Contact ID']; if (c && !m.has(c)) m.set(c, r); }
  let ok=0, err=0;
  for (const [cid, r] of m) {
    const gender = r['Contact: Gender'] || null;
    const { error } = await sb.from('profiles').update({ gender }).eq('salesforce_contact_id', cid);
    if (error) { err++; if (err <= 2) console.log('Err:', error.message); } else ok++;
  }
  console.log('Gender updated:', ok, 'Errors:', err);
}
run();
