'use client';

import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';

interface OTPInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
}

export function OTPInput({
  length = 6,
  onComplete,
  disabled = false,
  error = false,
}: OTPInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const getCode = useCallback(() => {
    return inputsRef.current.map((input) => input?.value || '').join('');
  }, []);

  const focusInput = useCallback((index: number) => {
    const target = inputsRef.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const input = inputsRef.current[index];
    if (input) {
      input.value = digit;
    }

    if (digit && index < length - 1) {
      focusInput(index + 1);
    }

    const code = getCode();
    if (code.length === length) {
      onComplete(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      const input = inputsRef.current[index];
      if (input && !input.value && index > 0) {
        focusInput(index - 1);
      } else if (input) {
        input.value = '';
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    for (let i = 0; i < length; i++) {
      const input = inputsRef.current[i];
      if (input) {
        input.value = pasted[i] || '';
      }
    }

    if (pasted.length === length) {
      onComplete(pasted);
    } else {
      focusInput(Math.min(pasted.length, length - 1));
    }
  }

  /** Reset all inputs and refocus the first one */
  function reset() {
    for (const input of inputsRef.current) {
      if (input) input.value = '';
    }
    focusInput(0);
  }

  // Expose reset via a data attribute trick: parent can call
  // document.querySelector('[data-otp-reset]')?.click()
  // But a cleaner way is to just re-mount. We'll keep this simple.

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => { inputsRef.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-12 rounded-lg border-2 bg-white text-center text-xl font-semibold text-brand-dark-text outline-none transition-all',
            'focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-gray-300',
            disabled && 'opacity-60 cursor-not-allowed'
          )}
        />
      ))}
    </div>
  );
}

// Helper to clear OTP inputs externally by re-rendering with a key
OTPInput.displayName = 'OTPInput';
