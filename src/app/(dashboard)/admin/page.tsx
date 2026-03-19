'use client';

import { useProfile } from '@/lib/hooks/use-profile';
import {
  Users,
  Calendar,
  Clock,
  PartyPopper,
  Plus,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

const stats = [
  {
    label: 'Total Members',
    value: '127',
    change: '+8 this month',
    icon: Users,
    color: 'text-brand-navy',
    bg: 'bg-brand-navy/10',
  },
  {
    label: 'Active Sessions',
    value: '12',
    change: '3 this week',
    icon: Calendar,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    label: 'Total Hours',
    value: '1,842',
    change: '+246 this month',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    label: 'Events',
    value: '24',
    change: '5 upcoming',
    icon: PartyPopper,
    color: 'text-brand-coral',
    bg: 'bg-brand-coral/10',
  },
];

const quickActions = [
  {
    label: 'Manage Users',
    description: 'Add, edit, or remove user accounts',
    href: '/admin/users',
    icon: Users,
    color: 'bg-brand-navy',
  },
  {
    label: 'Create Session',
    description: 'Schedule a new group session',
    href: '/admin/sessions',
    icon: Plus,
    color: 'bg-emerald-600',
  },
  {
    label: 'View Reports',
    description: 'Attendance and hours analytics',
    href: '/admin/hours',
    icon: BarChart3,
    color: 'bg-brand-coral',
  },
];

export default function AdminDashboardPage() {
  const { profile } = useProfile();

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md md:p-8">
        <h2 className="text-2xl font-bold md:text-3xl">
          Welcome back, {profile?.first_name ?? 'Admin'}
        </h2>
        <p className="mt-2 text-white/80">
          Here is an overview of your Maccabi Tzair community. Manage members,
          track attendance, and organize events all in one place.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-muted">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-brand-dark-text">{stat.value}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.bg}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-emerald-600">{stat.change}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="group flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className={`rounded-xl p-3 text-white ${action.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-dark-text">{action.label}</p>
                  <p className="text-sm text-brand-muted">{action.description}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-brand-muted opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Recent Activity</h3>
        <div className="space-y-4">
          {[
            { text: 'New member registered: Sarah Cohen', time: '2 hours ago', dot: 'bg-emerald-500' },
            { text: 'Attendance taken for SOM group', time: '4 hours ago', dot: 'bg-brand-navy' },
            { text: 'Community event "Shabbat Program" created', time: '1 day ago', dot: 'bg-brand-coral' },
            { text: 'Monthly hours report generated', time: '2 days ago', dot: 'bg-amber-500' },
          ].map((activity, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`mt-1.5 h-2 w-2 rounded-full ${activity.dot} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-brand-dark-text">{activity.text}</p>
                <p className="text-xs text-brand-muted">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
