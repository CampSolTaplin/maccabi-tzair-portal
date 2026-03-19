'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OTPInput } from '@/components/ui/otp-input';
import { cn } from '@/lib/utils/cn';

type EnrollmentStep = 'idle' | 'qr' | 'verify' | 'success';

interface TOTPFactor {
  id: string;
  status: string;
  friendly_name?: string;
  created_at?: string;
}

export default function SecurityPage() {
  const supabase = createClient();

  const [enrolledFactor, setEnrolledFactor] = useState<TOTPFactor | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollStep, setEnrollStep] = useState<EnrollmentStep>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [newFactorId, setNewFactorId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [otpKey, setOtpKey] = useState(0);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadFactors = useCallback(async () => {
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError('Failed to load MFA status.');
        return;
      }

      const verifiedFactors = data.totp.filter(
        (f) => f.status === 'verified'
      );

      if (verifiedFactors.length > 0) {
        setEnrolledFactor(verifiedFactors[0] as TOTPFactor);
      } else {
        setEnrolledFactor(null);
      }
    } catch {
      setError('Failed to load MFA status.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  async function handleEnroll() {
    setError('');
    setEnrollStep('qr');

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });

      if (enrollError) {
        setError('Failed to start enrollment. Please try again.');
        setEnrollStep('idle');
        return;
      }

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setNewFactorId(data.id);
    } catch {
      setError('An unexpected error occurred.');
      setEnrollStep('idle');
    }
  }

  async function handleVerifyEnrollment(code: string) {
    setError('');
    setVerifying(true);

    try {
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: newFactorId });

      if (challengeError) {
        setError('Failed to create challenge. Please try again.');
        setOtpKey((k) => k + 1);
        setVerifying(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: newFactorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        setError('Invalid code. Please try again.');
        setOtpKey((k) => k + 1);
        setVerifying(false);
        return;
      }

      setEnrollStep('success');
      // Reload factors to update state
      await loadFactors();
    } catch {
      setError('An unexpected error occurred.');
      setOtpKey((k) => k + 1);
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisable() {
    if (!enrolledFactor) return;

    setDisabling(true);
    setError('');

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: enrolledFactor.id,
      });

      if (unenrollError) {
        setError('Failed to disable 2FA. Please try again.');
        return;
      }

      setEnrolledFactor(null);
      setShowDisableConfirm(false);
      setEnrollStep('idle');
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setDisabling(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg
          className="w-8 h-8 animate-spin text-brand-navy"
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark-text">Security</h1>
        <p className="text-sm text-brand-muted mt-1">
          Manage your account security settings
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2.5">
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

      {/* Two-Factor Authentication Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy/10">
              <svg
                className="h-5 w-5 text-brand-navy"
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
            <div>
              <h2 className="text-lg font-semibold text-brand-dark-text">
                Two-Factor Authentication
              </h2>
              <p className="text-sm text-brand-muted">
                Add an extra layer of security to your account
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* MFA is enrolled and we're not in enrollment flow */}
          {enrolledFactor && enrollStep === 'idle' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 border border-emerald-200">
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  2FA Enabled
                </span>
              </div>

              {enrolledFactor.created_at && (
                <p className="text-sm text-brand-muted">
                  Enrolled on:{' '}
                  {new Date(enrolledFactor.created_at).toLocaleDateString(
                    'en-US',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  )}
                </p>
              )}

              {!showDisableConfirm ? (
                <button
                  onClick={() => setShowDisableConfirm(true)}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Disable 2FA
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    Are you sure you want to disable two-factor authentication?
                  </p>
                  <p className="text-sm text-red-600">
                    Your account will be less secure without 2FA.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDisable}
                      disabled={disabling}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                    >
                      {disabling ? 'Disabling...' : 'Yes, disable 2FA'}
                    </button>
                    <button
                      onClick={() => setShowDisableConfirm(false)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-brand-dark-text hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Not enrolled, show enable button */}
          {!enrolledFactor && enrollStep === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-brand-muted">
                Protect your account by requiring a verification code from your
                authenticator app in addition to your password.
              </p>
              <button
                onClick={handleEnroll}
                className="rounded-lg bg-brand-coral px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-coral/90 transition-colors"
              >
                Enable 2FA
              </button>
            </div>
          )}

          {/* Step 1: QR Code */}
          {enrollStep === 'qr' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-brand-dark-text mb-1">
                  Step 1: Scan QR Code
                </h3>
                <p className="text-sm text-brand-muted">
                  Scan this QR code with your authenticator app (Google
                  Authenticator, Authy, 1Password)
                </p>
              </div>

              {qrCode ? (
                <div className="flex justify-center">
                  <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
                    <img
                      src={qrCode}
                      alt="TOTP QR Code"
                      className="h-48 w-48"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <svg
                    className="w-8 h-8 animate-spin text-brand-navy"
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
                </div>
              )}

              {secret && (
                <div>
                  <p className="text-xs text-brand-muted mb-2">
                    Or enter this key manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 font-mono text-sm text-brand-dark-text tracking-wider break-all">
                      {secret}
                    </code>
                    <button
                      onClick={copySecret}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-brand-muted hover:bg-gray-50 transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => setEnrollStep('verify')}
                disabled={!qrCode}
                className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
              >
                Next: Verify Code
              </button>
            </div>
          )}

          {/* Step 2: Verify */}
          {enrollStep === 'verify' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-brand-dark-text mb-1">
                  Step 2: Verify Setup
                </h3>
                <p className="text-sm text-brand-muted">
                  Enter the 6-digit code from your authenticator app to confirm
                  setup
                </p>
              </div>

              <OTPInput
                key={otpKey}
                onComplete={handleVerifyEnrollment}
                disabled={verifying}
                error={!!error}
              />

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEnrollStep('qr');
                    setError('');
                  }}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-brand-dark-text hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    const inputs =
                      document.querySelectorAll<HTMLInputElement>(
                        'input[inputmode="numeric"]'
                      );
                    const code = Array.from(inputs)
                      .map((i) => i.value)
                      .join('');
                    if (code.length === 6) {
                      handleVerifyEnrollment(code);
                    }
                  }}
                  disabled={verifying}
                  className="flex-1 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {verifying ? (
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
                      Verifying...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {enrollStep === 'success' && (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <svg
                    className="h-8 w-8 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-brand-dark-text">
                  2FA has been enabled!
                </h3>
                <p className="text-sm text-brand-muted mt-1">
                  Your account is now protected with two-factor authentication.
                </p>
              </div>
              <button
                onClick={() => setEnrollStep('idle')}
                className="rounded-lg bg-brand-navy px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
