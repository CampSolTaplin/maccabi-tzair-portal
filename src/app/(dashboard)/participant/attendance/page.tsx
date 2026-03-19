'use client';

import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const attendanceSummary = [
  { label: 'Present', count: 20, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'Late', count: 3, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Absent', count: 2, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  { label: 'Excused', count: 1, icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
];

const recentSessions = [
  { date: 'Mar 15, 2026', status: 'present' as const },
  { date: 'Mar 8, 2026', status: 'present' as const },
  { date: 'Mar 1, 2026', status: 'late' as const },
  { date: 'Feb 22, 2026', status: 'present' as const },
  { date: 'Feb 15, 2026', status: 'absent' as const },
  { date: 'Feb 8, 2026', status: 'present' as const },
];

function statusBadge(status: string) {
  switch (status) {
    case 'present':
      return { text: 'Present', className: 'bg-emerald-50 text-emerald-700' };
    case 'late':
      return { text: 'Late', className: 'bg-amber-50 text-amber-700' };
    case 'absent':
      return { text: 'Absent', className: 'bg-red-50 text-red-700' };
    case 'excused':
      return { text: 'Excused', className: 'bg-gray-50 text-gray-700' };
    default:
      return { text: status, className: 'bg-gray-50 text-gray-700' };
  }
}

export default function MyAttendancePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-navy/10 p-3">
          <CalendarCheck className="h-7 w-7 text-brand-navy" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">My Attendance</h1>
          <p className="text-sm text-brand-muted">Track your session attendance history</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {attendanceSummary.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm">
              <div className={`inline-flex rounded-lg p-2 ${item.bg}`}>
                <Icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <p className="mt-3 text-2xl font-bold text-brand-dark-text">{item.count}</p>
              <p className="text-sm text-brand-muted">{item.label}</p>
            </div>
          );
        })}
      </div>

      {/* Calendar Placeholder */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Attendance Calendar</h3>
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16">
          <div className="text-center">
            <CalendarCheck className="mx-auto h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">
              Your attendance calendar will appear here
            </p>
            <p className="mt-1 text-xs text-brand-muted/70">
              Visual calendar view with color-coded attendance statuses
            </p>
          </div>
        </div>
      </div>

      {/* Session History */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Session History</h3>
        <div className="space-y-2">
          {recentSessions.map((session, i) => {
            const badge = statusBadge(session.status);
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <span className="text-sm font-medium text-brand-dark-text">{session.date}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                  {badge.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
