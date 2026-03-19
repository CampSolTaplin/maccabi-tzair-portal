import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { type LucideIcon } from 'lucide-react';
import { Button, type ButtonProps } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
  };
  className?: string;
  children?: React.ReactNode;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-brand-light-blue p-4">
          <Icon className="h-8 w-8 text-brand-navy/60" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-brand-dark-text">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-brand-muted">{description}</p>
      )}
      {action && (
        <Button
          variant={action.variant ?? 'primary'}
          size="sm"
          onClick={action.onClick}
          className="mt-5"
        >
          {action.label}
        </Button>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
