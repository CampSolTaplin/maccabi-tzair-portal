/**
 * US phone number helpers.
 *
 * Login accepts either an email or a US phone number as the identifier.
 * We normalize phone input to E.164 format (`+1XXXXXXXXXX`) before sending
 * it to Supabase, since that's what `signInWithPassword({ phone })` expects.
 */

/** Returns true if the input contains an `@` (and is therefore an email). */
export function looksLikeEmail(input: string): boolean {
  return input.includes('@');
}

/**
 * Normalize a US phone number to E.164 format (`+1XXXXXXXXXX`).
 *
 * Accepts:
 *   - `(305) 555-1234`
 *   - `305-555-1234`
 *   - `305.555.1234`
 *   - `3055551234`
 *   - `+1 (305) 555-1234`
 *   - `+13055551234`
 *   - `1 305 555 1234`
 *
 * Returns `null` if the number can't be coerced into a valid 10-digit US
 * number.
 */
export function normalizeUSPhone(input: string): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, '');

  // 10 digits → assume US, prepend country code
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // 11 digits starting with 1 → US with country code already included
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Quick predicate: does this input look like a phone number rather than an
 * email? Used by the login form to decide which auth method to call. Does
 * not validate that the phone is actually parseable — that's
 * `normalizeUSPhone`'s job.
 */
export function looksLikePhone(input: string): boolean {
  if (!input) return false;
  if (looksLikeEmail(input)) return false;
  // Has at least 7 digits (anything shorter isn't a phone)
  const digits = input.replace(/\D/g, '');
  return digits.length >= 7;
}
