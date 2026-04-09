'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  looksLikeEmail,
  looksLikePhone,
  normalizeUSPhone,
} from '@/lib/auth/phone';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const trimmed = identifier.trim();

      let authError;
      if (looksLikeEmail(trimmed)) {
        ({ error: authError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        }));
      } else if (looksLikePhone(trimmed)) {
        const phone = normalizeUSPhone(trimmed);
        if (!phone) {
          setError(
            'Please enter a valid US phone number (10 digits) or an email address.'
          );
          return;
        }
        // Resolve the phone to the email Supabase Auth uses for this user.
        // We don't use Supabase's Phone provider (it requires Twilio), so
        // each phone-login user has a synthetic internal email under the hood.
        const resolveRes = await fetch('/api/auth/resolve-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        if (!resolveRes.ok) {
          setError('Invalid credentials. Please try again.');
          return;
        }
        const { email: resolvedEmail } = await resolveRes.json();
        ({ error: authError } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password,
        }));
      } else {
        setError('Please enter your email or phone number.');
        return;
      }

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid credentials. Please try again.');
        } else {
          setError(authError.message);
        }
        return;
      }

      // Check if user has MFA enrolled
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
        // User has MFA enabled, redirect to verification
        window.location.href = '/mfa-verify';
        return;
      }

      // Full page reload to ensure cookies are sent to the server
      window.location.href = '/';
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - brand panel (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-navy via-brand-navy to-brand-coral/80 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-white/5" />
          <div className="absolute bottom-1/4 right-10 w-60 h-60 rounded-full bg-brand-coral/20" />
          <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-white/5" />
          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="mb-8">
            <span className="text-5xl" aria-hidden="true">
              ✡️
            </span>
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Maccabi Tzair
            <br />
            <span className="text-brand-coral/90 font-normal text-3xl">
              Miami
            </span>
          </h1>
          <p className="text-lg text-white/70 max-w-sm leading-relaxed">
            Building community, leadership, and Jewish identity through movement
            and purpose.
          </p>

          {/* Decorative bottom bar */}
          <div className="mt-12 flex gap-2">
            <div className="h-1 w-12 rounded-full bg-brand-coral" />
            <div className="h-1 w-8 rounded-full bg-white/30" />
            <div className="h-1 w-4 rounded-full bg-white/20" />
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center bg-brand-light-blue p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2">
              <span className="text-3xl" aria-hidden="true">
                ✡️
              </span>
              <h1 className="text-2xl font-bold text-brand-navy tracking-tight">
                Maccabi Tzair
              </h1>
            </div>
            <p className="text-sm text-brand-muted mt-1">Miami</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-lg shadow-brand-navy/5 p-8 sm:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-brand-dark-text">
                Welcome back
              </h2>
              <p className="text-brand-muted mt-1.5 text-sm">
                Sign in to access your portal
              </p>
            </div>

            {/* Error banner */}
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

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email or phone */}
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-sm font-medium text-brand-dark-text mb-1.5"
                >
                  Email or phone
                </label>
                <input
                  id="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  inputMode="email"
                  placeholder="you@example.com or (305) 555-1234"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-brand-dark-text placeholder:text-gray-400 outline-none transition-all focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-brand-dark-text mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm text-brand-dark-text placeholder:text-gray-400 outline-none transition-all focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
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
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-brand-muted mt-6">
            Maccabi Tzair Miami &middot; MARJCC
          </p>
        </div>
      </div>
    </div>
  );
}
