import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generate a 12-character password with upper, lower, digits, and special chars.
 */
export function generatePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  const array = new Uint32Array(12);
  crypto.getRandomValues(array);

  // Ensure at least one of each type
  const password = [
    upper[array[0] % upper.length],
    lower[array[1] % lower.length],
    digits[array[2] % digits.length],
    special[array[3] % special.length],
  ];

  for (let i = 4; i < 12; i++) {
    password.push(all[array[i] % all.length]);
  }

  // Shuffle
  for (let i = password.length - 1; i > 0; i--) {
    const j = array[i] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

/**
 * Find an existing profile by Salesforce contact ID.
 */
export async function findExistingProfileBySalesforceId(
  adminClient: SupabaseClient,
  sfContactId: string
) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('*')
    .eq('salesforce_contact_id', sfContactId)
    .maybeSingle();

  if (error) {
    throw new Error(`Profile lookup failed for SF ID ${sfContactId}: ${error.message}`);
  }

  return data;
}

let cachedSOMGroupId: string | null = null;

/**
 * Find the SOM group ID, cached after first lookup.
 */
export async function findSOMGroupId(adminClient: SupabaseClient): Promise<string> {
  if (cachedSOMGroupId) return cachedSOMGroupId;

  const { data, error } = await adminClient
    .from('groups')
    .select('id')
    .eq('slug', 'som')
    .single();

  if (error || !data) {
    throw new Error(`SOM group not found: ${error?.message ?? 'no data'}`);
  }

  cachedSOMGroupId = data.id as string;
  return cachedSOMGroupId!;
}
