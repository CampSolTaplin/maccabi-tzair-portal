import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  signTrustToken,
  MFA_TRUST_COOKIE_NAME,
  MFA_TRUST_DAYS,
} from '@/lib/auth/mfa-trust';

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only allow setting the trust cookie immediately after a successful MFA
  // verification — i.e. when the session is currently at aal2.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json(
      { error: 'MFA verification required' },
      { status: 403 }
    );
  }

  try {
    const { token, expiresAt } = await signTrustToken(user.id);

    const response = NextResponse.json({ ok: true, expiresAt });
    response.cookies.set(MFA_TRUST_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MFA_TRUST_DAYS * 86400,
    });
    return response;
  } catch (err) {
    console.error('mfa-trust: failed to sign token', err);
    return NextResponse.json(
      { error: 'Trust device feature is not configured on the server' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MFA_TRUST_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
