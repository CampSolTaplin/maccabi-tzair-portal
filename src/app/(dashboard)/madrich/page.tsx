'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ClipboardCheck,
  Cake,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useProfile } from '@/lib/hooks/use-profile';
import { cn } from '@/lib/utils/cn';

interface BirthdayRow {
  id: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  daysUntil: number;
  turningAge: number;
  groupName: string | null;
}

function formatBirthdate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}

function daysBadgeClasses(daysUntil: number): string {
  if (daysUntil === 0) return 'bg-brand-coral text-white';
  if (daysUntil <= 7) return 'bg-amber-100 text-amber-700';
  return 'bg-brand-navy/10 text-brand-navy';
}

export default function MadrichDashboardPage() {
  const { profile } = useProfile();

  const { data: birthdaysData, isLoading } = useQuery<{ birthdays: BirthdayRow[] }>({
    queryKey: ['madrich-birthdays'],
    queryFn: async () => {
      const res = await fetch('/api/madrich/birthdays');
      if (!res.ok) throw new Error('Failed to load birthdays');
      return res.json();
    },
  });

  const birthdays = birthdaysData?.birthdays ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md md:p-8">
        <h2 className="text-2xl font-bold md:text-3xl">
          Shalom, {profile?.first_name ?? 'Madrich'}!
        </h2>
        <p className="mt-2 text-white/80">
          Ready to make an impact? Manage your group attendance and keep an eye
          on your chanichim&apos;s birthdays from here.
        </p>
      </div>

      {/* Take Attendance CTA */}
      <Link
        href="/madrich/take-attendance"
        className="group flex items-center gap-4 rounded-2xl bg-brand-coral p-6 text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
      >
        <div className="rounded-xl bg-white/20 p-4">
          <ClipboardCheck className="h-8 w-8" />
        </div>
        <div className="flex-1">
          <p className="text-xl font-bold">Take Attendance</p>
          <p className="mt-1 text-white/80">
            Mark attendance for today&apos;s session
          </p>
        </div>
        <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
      </Link>

      {/* Upcoming birthdays */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg bg-brand-coral/10 p-2">
            <Cake className="h-5 w-5 text-brand-coral" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-brand-navy">
              Upcoming Birthdays
            </h3>
            <p className="text-xs text-brand-muted">
              Next 30 days — chanichim in your group(s)
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
          </div>
        ) : birthdays.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-brand-muted">
              No upcoming birthdays in the next 30 days.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {birthdays.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-coral/10 text-brand-coral font-bold text-sm">
                    {b.firstName[0]}
                    {b.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-brand-dark-text truncate">
                      {b.firstName} {b.lastName}
                    </p>
                    <p className="text-xs text-brand-muted">
                      {formatBirthdate(b.birthdate)} · turning {b.turningAge}
                      {b.groupName ? ` · ${b.groupName}` : ''}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                    daysBadgeClasses(b.daysUntil)
                  )}
                >
                  {daysLabel(b.daysUntil)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
