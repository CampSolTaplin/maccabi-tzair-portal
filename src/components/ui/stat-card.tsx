import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { ArrowUp, ArrowDown, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    label?: string;
  };
  icon?: LucideIcon;
  className?: string;
}

function StatCard({ label, value, change, icon: Icon, className }: StatCardProps) {
  const isPositive = change && change.value >= 0;
  const ChangeArrow = isPositive ? ArrowUp : ArrowDown;

  return (
    <div
      className={cn(
        'rounded-xl bg-white p-6 shadow-sm border border-gray-100',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-brand-muted">{label}</span>
          <span className="text-3xl font-bold tracking-tight text-brand-dark-text">
            {value}
          </span>
        </div>
        {Icon && (
          <div className="rounded-lg bg-brand-light-blue p-2.5">
            <Icon className="h-5 w-5 text-brand-navy" />
          </div>
        )}
      </div>

      {change && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              isPositive ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            <ChangeArrow className="h-3 w-3" />
            {Math.abs(change.value)}%
          </span>
          {change.label && (
            <span className="text-xs text-brand-muted">{change.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

export { StatCard };
export type { StatCardProps };
