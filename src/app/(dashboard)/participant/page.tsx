'use client';

import { useProfile } from '@/lib/hooks/use-profile';
import {
  CalendarCheck,
  Clock,
  Target,
  TrendingUp,
  Star,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

const recentActivity = [
  { text: 'Attended SOM weekly session', date: 'Mar 15', type: 'attendance' },
  { text: 'Earned 2 community hours', date: 'Mar 15', type: 'hours' },
  { text: 'Updated goal: "Lead a community event"', date: 'Mar 12', type: 'goal' },
  { text: 'Completed self-evaluation', date: 'Mar 10', type: 'evaluation' },
  { text: 'Attended Shabbat event', date: 'Mar 8', type: 'attendance' },
];

function activityDot(type: string) {
  switch (type) {
    case 'attendance': return 'bg-emerald-500';
    case 'hours': return 'bg-amber-500';
    case 'goal': return 'bg-brand-coral';
    case 'evaluation': return 'bg-brand-navy';
    default: return 'bg-gray-400';
  }
}

export default function ParticipantDashboardPage() {
  const { profile } = useProfile();

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md md:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Star className="h-5 w-5 text-amber-300" />
          <span className="text-sm font-medium text-white/70">Welcome back!</span>
        </div>
        <h2 className="text-2xl font-bold md:text-3xl">
          {profile?.first_name ?? 'Participant'} {profile?.last_name ?? ''}
        </h2>
        <p className="mt-2 text-white/80">
          Keep up the great work! Track your progress and reach your goals.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/participant/attendance"
          className="group rounded-xl bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-50 p-3">
              <CalendarCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-brand-muted opacity-0 transition-all group-hover:opacity-100" />
          </div>
          <p className="mt-4 text-2xl font-bold text-brand-dark-text">87%</p>
          <p className="text-sm font-medium text-brand-muted">Attendance Rate</p>
        </Link>

        <Link
          href="/participant/hours"
          className="group rounded-xl bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-amber-50 p-3">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <ArrowRight className="h-4 w-4 text-brand-muted opacity-0 transition-all group-hover:opacity-100" />
          </div>
          <p className="mt-4 text-2xl font-bold text-brand-dark-text">24.5</p>
          <p className="text-sm font-medium text-brand-muted">Community Hours</p>
        </Link>

        <Link
          href="/participant/goals"
          className="group rounded-xl bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-brand-coral/10 p-3">
              <Target className="h-6 w-6 text-brand-coral" />
            </div>
            <ArrowRight className="h-4 w-4 text-brand-muted opacity-0 transition-all group-hover:opacity-100" />
          </div>
          <p className="mt-4 text-2xl font-bold text-brand-dark-text">3</p>
          <p className="text-sm font-medium text-brand-muted">Active Goals</p>
        </Link>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-brand-navy/10 p-3 w-fit">
            <TrendingUp className="h-6 w-6 text-brand-navy" />
          </div>
          <p className="mt-4 text-2xl font-bold text-brand-dark-text">Level 3</p>
          <p className="text-sm font-medium text-brand-muted">Growth Stage</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Recent Activity</h3>
        <div className="space-y-4">
          {recentActivity.map((activity, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${activityDot(activity.type)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-brand-dark-text">{activity.text}</p>
                <p className="text-xs text-brand-muted">{activity.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
