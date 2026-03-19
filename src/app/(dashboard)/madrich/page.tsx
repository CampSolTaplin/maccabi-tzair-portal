'use client';

import { useProfile } from '@/lib/hooks/use-profile';
import {
  ClipboardCheck,
  Users,
  TrendingUp,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export default function MadrichDashboardPage() {
  const { profile } = useProfile();

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md md:p-8">
        <h2 className="text-2xl font-bold md:text-3xl">
          Shalom, {profile?.first_name ?? 'Madrich'}!
        </h2>
        <p className="mt-2 text-white/80">
          Ready to make an impact? Manage your group attendance and track your
          members&apos; progress from here.
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

      {/* Group Overview Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-navy/10 p-3">
              <Users className="h-6 w-6 text-brand-navy" />
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted">Group Members</p>
              <p className="text-2xl font-bold text-brand-dark-text">18</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted">Avg Attendance</p>
              <p className="text-2xl font-bold text-brand-dark-text">82%</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3">
              <CalendarDays className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-brand-muted">Sessions This Month</p>
              <p className="text-2xl font-bold text-brand-dark-text">4</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Recent Sessions</h3>
        <div className="space-y-3">
          {[
            { date: 'Mar 15, 2026', present: 16, total: 18, rate: '89%' },
            { date: 'Mar 8, 2026', present: 14, total: 18, rate: '78%' },
            { date: 'Mar 1, 2026', present: 15, total: 18, rate: '83%' },
          ].map((session, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
            >
              <div>
                <p className="font-medium text-brand-dark-text">{session.date}</p>
                <p className="text-sm text-brand-muted">
                  {session.present} of {session.total} present
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                {session.rate}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
