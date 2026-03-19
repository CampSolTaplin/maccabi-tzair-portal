'use client';

import {
  Clock,
  CalendarCheck,
  PartyPopper,
  HandHeart,
  Award,
} from 'lucide-react';

const hoursBySource = [
  { source: 'Attendance', hours: 16, icon: CalendarCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { source: 'Events', hours: 5, icon: PartyPopper, color: 'text-brand-coral', bg: 'bg-brand-coral/10' },
  { source: 'Volunteering', hours: 3, icon: HandHeart, color: 'text-sky-600', bg: 'bg-sky-50' },
  { source: 'Goal Bonus', hours: 0.5, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
];

const recentHours = [
  { description: 'SOM Weekly Session', date: 'Mar 15', hours: 2, source: 'Attendance' },
  { description: 'Shabbat Program', date: 'Mar 8', hours: 3, source: 'Event' },
  { description: 'SOM Weekly Session', date: 'Mar 8', hours: 2, source: 'Attendance' },
  { description: 'Community Cleanup', date: 'Mar 5', hours: 2, source: 'Volunteering' },
  { description: 'SOM Weekly Session (late)', date: 'Mar 1', hours: 1, source: 'Attendance' },
];

export default function MyHoursPage() {
  const totalHours = hoursBySource.reduce((sum, h) => sum + h.hours, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-50 p-3">
          <Clock className="h-7 w-7 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">My Community Hours</h1>
          <p className="text-sm text-brand-muted">Track your earned community service hours</p>
        </div>
      </div>

      {/* Total Hours Card */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-6 text-white shadow-md">
        <p className="text-sm font-medium text-white/80">Total Hours Earned</p>
        <p className="mt-1 text-4xl font-bold">{totalHours}</p>
        <div className="mt-4 h-2 rounded-full bg-white/20">
          <div
            className="h-2 rounded-full bg-white transition-all"
            style={{ width: `${Math.min((totalHours / 40) * 100, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-white/80">{totalHours} / 40 hours goal</p>
      </div>

      {/* Hours by Source */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {hoursBySource.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.source} className="rounded-xl bg-white p-4 shadow-sm">
              <div className={`inline-flex rounded-lg p-2 ${item.bg}`}>
                <Icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <p className="mt-3 text-2xl font-bold text-brand-dark-text">{item.hours}</p>
              <p className="text-sm text-brand-muted">{item.source}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Hours */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Recent Hours</h3>
        <div className="space-y-2">
          {recentHours.map((entry, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-brand-dark-text">{entry.description}</p>
                <p className="text-xs text-brand-muted">{entry.date} &middot; {entry.source}</p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                +{entry.hours}h
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
