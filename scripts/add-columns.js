const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://oseauvhnjjzhcscqwvfc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs');
async function run() {
  const sql = `
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS father_name TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS father_email TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS father_phone TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mother_name TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mother_email TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mother_phone TEXT;
  `;
  const { error } = await sb.rpc('exec_sql', { query: sql });
  if (error) {
    console.log('RPC not available, trying direct REST...');
    // Use fetch to the SQL endpoint directly
    const res = await fetch('https://oseauvhnjjzhcscqwvfc.supabase.co/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    console.log('REST status:', res.status, await res.text());
  } else {
    console.log('Done via RPC');
  }
}
run();
