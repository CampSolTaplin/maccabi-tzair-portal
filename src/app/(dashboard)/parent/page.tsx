'use client';

import { useProfile } from '@/lib/hooks/use-profile';
import {
  Users,
  CalendarCheck,
  Clock,
  TrendingUp,
  Bell,
  ChevronRight,
} from 'lucide-react';

const children = [
  {
    name: 'Daniel Cohen',
    group: 'SOM',
    attendance: '91%',
    hours: 28,
    avatar: 'DC',
  },
  {
    name: 'Maya Cohen',
    group: 'Juniors',
    attendance: '78%',
    hours: 15,
    avatar: 'MC',
  },
];

const notifications = [
  { text: 'Daniel was present at yesterday\'s session', time: '1 day ago', read: false },
  { text: 'Maya\'s attendance dropped below 80%', time: '3 days ago', read: false },
  { text: 'Upcoming event: Shabbat Program on Mar 22', time: '5 days ago', read: true },
];

export default function ParentDashboardPage() {
  const { profile } = useProfile();

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md md:p-8">
        <h2 className="text-2xl font-bold md:text-3xl">
          Welcome, {profile?.first_name ?? 'Parent'}
        </h2>
        <p className="mt-2 text-white/80">
          Stay connected with your children&apos;s Maccabi Tzair journey.
          Track their attendance, hours, and milestones.
        </p>
      </div>

      {/* Children Cards */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">My Children</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {children.map((child) => (
            <div
              key={child.name}
              className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-lg font-bold text-white">
                  {child.avatar}
                </div>
                <div>
                  <p className="font-semibold text-brand-dark-text">{child.name}</p>
                  <span className="inline-block rounded-full bg-brand-light-blue px-2.5 py-0.5 text-xs font-medium text-brand-navy">
                    {child.group}
                  </span>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 text-brand-muted" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <CalendarCheck className="mx-auto h-5 w-5 text-emerald-600 mb-1" />
                  <p className="text-lg font-bold text-emerald-700">{child.attendance}</p>
                  <p className="text-[10px] text-emerald-600">Attendance</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-center">
                  <Clock className="mx-auto h-5 w-5 text-amber-600 mb-1" />
                  <p className="text-lg font-bold text-amber-700">{child.hours}</p>
                  <p className="text-[10px] text-amber-600">Hours</p>
                </div>
                <div className="rounded-lg bg-brand-navy/5 p-3 text-center">
                  <TrendingUp className="mx-auto h-5 w-5 text-brand-navy mb-1" />
                  <p className="text-lg font-bold text-brand-navy">Good</p>
                  <p className="text-[10px] text-brand-muted">Progress</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-brand-navy" />
          <h3 className="text-lg font-semibold text-brand-navy">Notifications</h3>
        </div>
        <div className="space-y-3">
          {notifications.map((notif, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-gray-100 p-4"
            >
              {!notif.read && (
                <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-coral" />
              )}
              {notif.read && <div className="mt-1.5 h-2 w-2 flex-shrink-0" />}
              <div>
                <p className="text-sm text-brand-dark-text">{notif.text}</p>
                <p className="text-xs text-brand-muted">{notif.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
