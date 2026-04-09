/**
 * "Trust this device" cookie for skipping MFA on subsequent logins.
 *
 * After a user completes MFA verification we issue a signed cookie that
 * binds their user_id to a 30-day expiration. On future logins the
 * middleware verifies the cookie and lets them through to admin routes
 * without re-prompting for the MFA code.
 *
 * The cookie value is a tiny HS256 token: `<base64url(payload)>.<base64url(sig)>`
 * Payload is JSON: `{ sub: <user_id>, exp: <unix_seconds> }`
 *
 * Uses Web Crypto so it works in the Edge runtime (middleware).
 */

const COOKIE_NAME = 'mfa_trust';
const TRUST_DAYS = 30;

function getSecret(): string {
  const secret = process.env.MFA_TRUST_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'MFA_TRUST_SECRET is not configured (must be at least 32 characters)'
    );
  }
  return secret;
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  return new Uint8Array(signature);
}

export async function signTrustToken(
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 86400 * 1000);
  const payload = JSON.stringify({
    sub: userId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const payloadB64 = base64UrlEncode(payload);
  const sig = await hmacSign(getSecret(), payloadB64);
  return { token: `${payloadB64}.${base64UrlEncode(sig)}`, expiresAt };
}

export async function verifyTrustToken(
  token: string,
  expectedUserId: string
): Promise<boolean> {
  try {
    const dot = token.indexOf('.');
    if (dot < 1 || dot === token.length - 1) return false;

    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const expectedSig = await hmacSign(getSecret(), payloadB64);
    const providedSig = base64UrlDecode(sigB64);

    if (expectedSig.length !== providedSig.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      diff |= expectedSig[i] ^ providedSig[i];
    }
    if (diff !== 0) return false;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as { sub?: string; exp?: number };
    if (!payload.sub || payload.sub !== expectedUserId) return false;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}

export const MFA_TRUST_COOKIE_NAME = COOKIE_NAME;
export const MFA_TRUST_DAYS = TRUST_DAYS;
