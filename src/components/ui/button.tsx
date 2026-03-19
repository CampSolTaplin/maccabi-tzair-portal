'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils/cn';
import { Spinner } from './spinner';

const variantClasses = {
  primary:
    'bg-brand-navy text-white hover:bg-brand-navy/90 focus-visible:ring-brand-navy',
  secondary:
    'bg-brand-coral text-white hover:bg-brand-coral/90 focus-visible:ring-brand-coral',
  outline:
    'border border-brand-navy text-brand-navy bg-transparent hover:bg-brand-navy/5 focus-visible:ring-brand-navy',
  ghost:
    'text-brand-navy bg-transparent hover:bg-brand-navy/5 focus-visible:ring-brand-navy',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
} as const;

const sizeClasses = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
} as const;

type ButtonVariant = keyof typeof variantClasses;
type ButtonSize = keyof typeof sizeClasses;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
