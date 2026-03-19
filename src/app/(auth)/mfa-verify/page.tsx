'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OTPInput } from '@/components/ui/otp-input';

export default function MFAVerifyPage() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [otpKey, setOtpKey] = useState(0); // used to reset OTPInput

  const supabase = createClient();

  const createChallenge = useCallback(async (fId: string) => {
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: fId,
    });
    if (challengeError) {
      setError('Failed to create MFA challenge. Please try logging in again.');
      return;
    }
    setChallengeId(data.id);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      try {
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) {
          setError('Failed to load MFA factors. Please try logging in again.');
          return;
        }

        const totpFactors = data.totp.filter(
          (f) => f.status === 'verified'
        );

        if (totpFactors.length === 0) {
          // No MFA enrolled, shouldn't be on this page
          window.location.href = '/';
          return;
        }

        const factor = totpFactors[0];
        setFactorId(factor.id);
        await createChallenge(factor.id);
      } catch {
        setError('An unexpected error occurred.');
      } finally {
        setInitializing(false);
      }
    }

    init();
  }, [supabase, createChallenge]);

  async function handleVerify(code: string) {
    if (!factorId || !challengeId) return;

    setError('');
    setLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });

      if (verifyError) {
        setError('Invalid code. Please try again.');
        setOtpKey((k) => k + 1); // reset inputs
        // Create a new challenge for the next attempt
        await createChallenge(factorId);
        return;
      }

      // Success - full page reload to ensure cookies are set
      window.location.href = '/';
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setOtpKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-light-blue">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="w-10 h-10 animate-spin text-brand-navy"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm font-medium text-brand-muted">
            Preparing verification...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light-blue p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg shadow-brand-navy/5 p-8 sm:p-10">
          {/* Shield icon */}
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-navy/10">
              <svg
                className="h-8 w-8 text-brand-navy"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                />
              </svg>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-brand-dark-text">
              Two-Factor Authentication
            </h1>
            <p className="text-brand-muted mt-2 text-sm">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2.5">
              <svg
                className="w-4 h-4 mt-0.5 shrink-0 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="mb-8">
            <OTPInput
              key={otpKey}
              onComplete={handleVerify}
              disabled={loading}
              error={!!error}
            />
          </div>

          {/* Verify button (in case auto-submit doesn't trigger) */}
          <button
            onClick={() => {
              // Gather current values from inputs
              const inputs = document.querySelectorAll<HTMLInputElement>(
                'input[inputmode="numeric"]'
              );
              const code = Array.from(inputs)
                .map((i) => i.value)
                .join('');
              if (code.length === 6) {
                handleVerify(code);
              }
            }}
            disabled={loading}
            className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-navy/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Verifying...</span>
              </>
            ) : (
              'Verify'
            )}
          </button>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <button
              onClick={handleSignOut}
              className="text-sm text-brand-muted hover:text-brand-dark-text transition-colors"
            >
              Back to login
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-brand-muted mt-6">
          Maccabi Tzair Miami &middot; MARJCC
        </p>
      </div>
    </div>
  );
}
