import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeUSPhone } from '@/lib/auth/phone';

/**
 * Public endpoint that maps a US phone number to the email Supabase Auth
 * uses for that user. This exists because we deliberately do NOT use
 * Supabase's Phone provider (it requires a paid SMS provider like Twilio
 * which we don't have access to). Instead, every user with phone-login
 * gets a synthetic internal email — and this endpoint lets the login
 * form translate the phone the user typed back into the email Supabase
 * is expecting.
 *
 * All roles are eligible for phone login. We always return a generic 404
 * on miss to avoid leaking which phones are registered.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phoneInput = typeof body?.phone === 'string' ? body.phone : '';

    const normalized = normalizeUSPhone(phoneInput);
    if (!normalized) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // The data in profiles.phone is a mix of normalized E.164 (+17548027346)
    // and legacy 10-digit format (7548027346) imported from older scripts.
    // Look up both shapes.
    const tenDigit = normalized.replace(/^\+1/, '');

    const supabase = createAdminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .or(`phone.eq.${normalized},phone.eq.${tenDigit}`)
      .limit(1)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.getUserById(profile.id);

    if (authError || !authData?.user?.email) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    return NextResponse.json({ email: authData.user.email });
  } catch (err) {
    console.error('resolve-phone error:', err);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }
}
