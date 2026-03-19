const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://oseauvhnjjzhcscqwvfc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zZWF1dmhuamp6aGNzY3F3dmZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMzMzOCwiZXhwIjoyMDg5NTA5MzM4fQ.fhxpgLFoQ31BFfaWwPFh2YBQiUavHP9NlwVap4sgsOs');

const SF_URL = 'https://marjcc--full.sandbox.my.salesforce.com';
const SF_CID = '3MVG9XhRuzJUtKtBmtlvhogoh6C8bagopdnhgPF_Ehl3BrX3E8S2.pTjdUoEYCyZOZpBezZfGL5nV.WBXRJZq';
const SF_SEC = '2AB233FB0519EC1E0FFB7007220ABBA54460C80B60946F6DF9442CD56C45585B';
let sfToken = null;

// Salesforce IDs: 15-char (case-sensitive) vs 18-char (case-insensitive)
// Normalize to 15-char for matching
function sf15(id) { return id ? id.substring(0, 15) : null; }

async function getSFToken() {
  if (sfToken) return sfToken;
  const res = await fetch(`${SF_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${SF_CID}&client_secret=${SF_SEC}`
  });
  sfToken = (await res.json()).access_token;
  return sfToken;
}

async function sfQuery(soql) {
  const token = await getSFToken();
  const res = await fetch(`${SF_URL}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.records || [];
}

async function run() {
  const { data: profiles } = await sb.from('profiles')
    .select('id, salesforce_account_id, salesforce_contact_id')
    .not('salesforce_account_id', 'is', null)
    .eq('role', 'participant');

  const accountIds = [...new Set(profiles.map(p => p.salesforce_account_id).filter(Boolean))];
  console.log(`${profiles.length} participants, ${accountIds.length} families`);

  // Query SF for adults - use 15-char IDs in the IN clause
  const allParents = new Map(); // 15-char accountId -> [contacts]
  
  for (let i = 0; i < accountIds.length; i += 100) {
    const batch = accountIds.slice(i, i + 100);
    const inClause = batch.map(id => `'${id}'`).join(',');
    const soql = `SELECT Id, FirstName, LastName, Email, MobilePhone, Phone, AccountId, TREX1__Age__c, Gender__c FROM Contact WHERE AccountId IN (${inClause}) AND TREX1__Age__c > 18`;
    const results = await sfQuery(soql);
    console.log(`Batch ${Math.floor(i/100)+1}: ${results.length} adults`);
    
    for (const r of results) {
      const key = sf15(r.AccountId);
      if (!allParents.has(key)) allParents.set(key, []);
      allParents.get(key).push(r);
    }
  }
  console.log(`Families with adults: ${allParents.size}`);

  let updated = 0, noParents = 0, errors = 0;
  for (const profile of profiles) {
    const key = sf15(profile.salesforce_account_id);
    const parents = allParents.get(key) || [];
    const adults = parents.filter(p => sf15(p.Id) !== sf15(profile.salesforce_contact_id));
    
    if (adults.length === 0) { noParents++; continue; }

    let father = null, mother = null;
    for (const a of adults) {
      const g = (a.Gender__c || '').toLowerCase();
      if (g.includes('male') && !g.includes('female')) { if (!father) father = a; }
      else if (g.includes('female')) { if (!mother) mother = a; }
      else { if (!father) father = a; else if (!mother) mother = a; }
    }
    if (!father && !mother) { father = adults[0]; if (adults.length > 1) mother = adults[1]; }

    const u = {};
    if (father) {
      u.father_name = `${father.FirstName || ''} ${father.LastName || ''}`.trim();
      u.father_email = father.Email ? father.Email.replace('.invalid','') : null;
      u.father_phone = father.MobilePhone || father.Phone || null;
    }
    if (mother) {
      u.mother_name = `${mother.FirstName || ''} ${mother.LastName || ''}`.trim();
      u.mother_email = mother.Email ? mother.Email.replace('.invalid','') : null;
      u.mother_phone = mother.MobilePhone || mother.Phone || null;
    }

    if (Object.keys(u).length > 0) {
      const { error } = await sb.from('profiles').update(u).eq('id', profile.id);
      if (error) { errors++; if (errors <= 3) console.log('Err:', error.message); }
      else updated++;
    }
  }
  console.log(`\nDone! Updated: ${updated}, No parents: ${noParents}, Errors: ${errors}`);
}
run().catch(console.error);
