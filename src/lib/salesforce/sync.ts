import { createAdminClient } from '@/lib/supabase/admin';
import { queryAllSOQL } from './client';
import type { SalesforceContact, EnrichResult } from './types';

/* ── School normalization map ── */

const SCHOOL_MAP: Record<string, string> = {
  hillel: 'Scheck Hillel Community School',
  'scheck hillel': 'Scheck Hillel Community School',
  'scheck hillel community school': 'Scheck Hillel Community School',
  'ben gamla': 'Ben Gamla Charter School',
  'ben gamla charter school': 'Ben Gamla Charter School',
  posnack: 'David Posnack Jewish Day School',
  'posnack school': 'David Posnack Jewish Day School',
  'david posnack jewish day school': 'David Posnack Jewish Day School',
  aces: 'Aventura City of Excellence School',
  'aventura city of excellence school': 'Aventura City of Excellence School',
  krop: 'Krop Senior High',
  kropp: 'Krop Senior High',
  'don soffer': 'Don Soffer Aventura High School',
  'don soffer aventura high school': 'Don Soffer Aventura High School',
  nsu: 'NSU University School',
  'nsu university school': 'NSU University School',
  'nova university school': 'NSU University School',
  'highland oaks': 'Highland Oaks',
  'highland oaks elementary': 'Highland Oaks',
  'highland oaks middle': 'Highland Oaks',
  'pine crest': 'Pine Crest School',
  'pine crest school': 'Pine Crest School',
  pinecrest: 'Pine Crest School',
  'aventura waterways': 'Aventura Waterways K-8',
  'aventura waterways k-8': 'Aventura Waterways K-8',
  jla: 'Jewish Leadership Academy',
  hom: 'Hebrew of Miami',
  'hebrew of miami': 'Hebrew of Miami',
  'ruth k broad': 'Ruth K. Broad Bay Harbor K-8',
  bridgeprep: 'BridgePrep Academy',
  'beachside montessori': 'Beachside Montessori Village',
  'beachside montessori village': 'Beachside Montessori Village',
  vabhoe: 'VABHOE',
};

/* ── Allergy cleanup ── */

const NO_ALLERGY = new Set([
  'no',
  'n/a',
  'na',
  'none',
  'no.',
  'nope',
  'no allergies',
  'non',
  'no known allergies',
  'ninguna',
  'n',
  '-',
  'no tiene',
  'nothing',
]);

function normalizeSchool(raw: string | null): { value: string | null; normalized: boolean } {
  if (!raw) return { value: null, normalized: false };
  const trimmed = raw.trim();
  const mapped = SCHOOL_MAP[trimmed.toLowerCase()];
  if (mapped && mapped !== trimmed) return { value: mapped, normalized: true };
  return { value: trimmed, normalized: false };
}

function cleanAllergies(raw: string | null): { value: string | null; cleaned: boolean } {
  if (!raw) return { value: null, cleaned: false };
  const trimmed = raw.trim();
  if (NO_ALLERGY.has(trimmed.toLowerCase())) return { value: null, cleaned: true };
  return { value: trimmed, cleaned: false };
}

function cleanEmail(email: string | null): string | null {
  if (!email) return null;
  return email.replace('.invalid', '');
}

/** Normalize Salesforce IDs to 15-char for comparison */
function sf15(id: string | null): string | null {
  return id ? id.substring(0, 15) : null;
}

/* ── Main enrich function ── */

export async function runSalesforceEnrich(triggeredBy: string): Promise<EnrichResult> {
  const adminClient = createAdminClient();

  const result: EnrichResult = {
    totalProfiles: 0,
    enrichedFromSF: 0,
    parentsFound: 0,
    schoolsNormalized: 0,
    allergiesCleaned: 0,
    errors: [],
  };

  // 1. Get all profiles with salesforce_contact_id
  const { data: profiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, salesforce_contact_id, salesforce_account_id, first_name, last_name')
    .not('salesforce_contact_id', 'is', null);

  if (profilesError) {
    throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
  }

  if (!profiles || profiles.length === 0) {
    return result;
  }

  result.totalProfiles = profiles.length;

  // 2. Collect unique contact IDs and account IDs
  const contactIds = profiles
    .map((p) => p.salesforce_contact_id as string)
    .filter(Boolean);
  const accountIds = [
    ...new Set(
      profiles
        .map((p) => p.salesforce_account_id as string)
        .filter(Boolean)
    ),
  ];

  // 3. Query SF for contact details (batch by 200)
  const sfContactMap = new Map<string, SalesforceContact>();

  for (let i = 0; i < contactIds.length; i += 200) {
    const batch = contactIds.slice(i, i + 200);
    const inClause = batch.map((id) => `'${id}'`).join(',');
    const soql = `
      SELECT Id, FirstName, LastName, Email, MobilePhone, Phone, Gender__c,
             TREX1__Age__c, TREX1__Grade__c, School__c, Allergies__c,
             Behavorial_Issues__c, AccountId
      FROM Contact WHERE Id IN (${inClause})
    `.trim();

    const records = await queryAllSOQL<SalesforceContact>(soql);
    for (const r of records) {
      sfContactMap.set(r.Id, r);
    }
  }

  // 4. Query SF for adults in same accounts (for parent data)
  const adultsByAccount = new Map<string, SalesforceContact[]>();

  for (let i = 0; i < accountIds.length; i += 200) {
    const batch = accountIds.slice(i, i + 200);
    const inClause = batch.map((id) => `'${id}'`).join(',');
    const soql = `
      SELECT Id, FirstName, LastName, Email, MobilePhone, Phone, AccountId,
             TREX1__Age__c, Gender__c
      FROM Contact WHERE AccountId IN (${inClause}) AND TREX1__Age__c > 18
    `.trim();

    const records = await queryAllSOQL<SalesforceContact>(soql);
    for (const r of records) {
      const key = sf15(r.AccountId)!;
      if (!adultsByAccount.has(key)) adultsByAccount.set(key, []);
      adultsByAccount.get(key)!.push(r);
    }
  }

  // 5. For each profile, enrich with SF data
  for (const profile of profiles) {
    try {
      const sfContact = sfContactMap.get(profile.salesforce_contact_id as string);
      if (!sfContact) continue; // Not found in SF, skip

      const update: Record<string, unknown> = {};
      let wasEnriched = false;

      // a. Update gender from SF contact
      if (sfContact.Gender__c) {
        update.gender = sfContact.Gender__c;
        wasEnriched = true;
      }

      // b. Normalize school name
      const school = normalizeSchool(sfContact.School__c);
      if (school.value !== undefined) {
        update.school = school.value;
        if (school.normalized) result.schoolsNormalized++;
        wasEnriched = true;
      }

      // c. Clean allergies
      const allergies = cleanAllergies(sfContact.Allergies__c);
      update.allergies = allergies.value;
      if (allergies.cleaned) result.allergiesCleaned++;
      wasEnriched = true;

      // d. Find father and mother from adults in same account
      const accountKey = sf15(profile.salesforce_account_id as string);
      if (accountKey) {
        const adults = (adultsByAccount.get(accountKey) || []).filter(
          (a) => sf15(a.Id) !== sf15(profile.salesforce_contact_id as string)
        );

        if (adults.length > 0) {
          let father: SalesforceContact | null = null;
          let mother: SalesforceContact | null = null;

          // Gender-based classification with fallback
          for (const a of adults) {
            const g = (a.Gender__c || '').toLowerCase();
            if (g.includes('male') && !g.includes('female')) {
              if (!father) father = a;
            } else if (g.includes('female')) {
              if (!mother) mother = a;
            } else {
              // Unknown gender: assign to first available slot
              if (!father) father = a;
              else if (!mother) mother = a;
            }
          }
          // Fallback if gender classification found nobody
          if (!father && !mother) {
            father = adults[0];
            if (adults.length > 1) mother = adults[1];
          }

          // e. Update father data
          if (father) {
            update.father_name =
              `${father.FirstName || ''} ${father.LastName || ''}`.trim();
            update.father_email = cleanEmail(father.Email);
            update.father_phone = father.MobilePhone || father.Phone || null;
            result.parentsFound++;
          }

          // f. Update mother data
          if (mother) {
            update.mother_name =
              `${mother.FirstName || ''} ${mother.LastName || ''}`.trim();
            update.mother_email = cleanEmail(mother.Email);
            update.mother_phone = mother.MobilePhone || mother.Phone || null;
            result.parentsFound++;
          }

          wasEnriched = true;
        }
      }

      // g. Apply update
      if (wasEnriched && Object.keys(update).length > 0) {
        const { error: updateError } = await adminClient
          .from('profiles')
          .update(update)
          .eq('id', profile.id);

        if (updateError) {
          throw new Error(`Profile update failed: ${updateError.message}`);
        }

        result.enrichedFromSF++;
      }
    } catch (err) {
      const name =
        `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() ||
        'Unknown';
      result.errors.push({
        contactId: profile.salesforce_contact_id as string,
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
