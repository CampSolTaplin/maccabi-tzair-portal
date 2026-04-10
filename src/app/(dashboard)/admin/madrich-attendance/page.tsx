'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  AlertTriangle,
  Loader2,
  Lock,
  Filter,
  ChevronDown,
  ChevronRight,
  Upload,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SessionRow {
  id: string;
  groupId: string;
  groupName: string;
  groupSlug: string;
  groupArea: string;
  sessionDate: string;
  sessionType: string;
  title: string | null;
  isCancelled: boolean;
  isLocked: boolean;
  isLockedStaff: boolean;
  hoursPresent: number;
  hoursLate: number;
  attendanceCount: number;
}

interface DateGroup {
  date: string;
  dayLabel: string;
  dayNum: number;
  monthLabel: string;
  sessions: SessionRow[];
  lockedStaffCount: number;
  cancelledCount: number;
}

const AREA_TABS = [
  { key: 'all', label: 'All Groups' },
  { key: 'katan', label: 'Katan' },
  { key: 'noar', label: 'Noar' },
  { key: 'leadership', label: 'Leadership' },
] as const;

type AreaFilter = (typeof AREA_TABS)[number]['key'];

const GROUP_AREA_COLORS: Record<string, string> = {
  katan: 'bg-blue-100 text-blue-700 border-blue-200',
  noar: 'bg-purple-100 text-purple-700 border-purple-200',
  leadership: 'bg-amber-100 text-amber-700 border-amber-200',
};

export default function StaffAttendancePage() {
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ['staff-att-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const sessions = data?.sessions ?? [];

  const isPast = (date: string) => new Date(date + 'T23:59:59') < new Date();

  // Group sessions by date
  const dateGroups = useMemo(() => {
    const filtered = areaFilter === 'all' ? sessions : sessions.filter((s) => s.groupArea === areaFilter);
    const map = new Map<string, SessionRow[]>();

    for (const s of filtered) {
      if (s.isCancelled) continue;
      if (!map.has(s.sessionDate)) map.set(s.sessionDate, []);
      map.get(s.sessionDate)!.push(s);
    }

    const groups: DateGroup[] = [];
    for (const [date, dateSessions] of map) {
      const d = new Date(date + 'T12:00:00');
      groups.push({
        date,
        dayLabel: d.toLocaleDateString('en-US', { weekday: 'long' }),
        dayNum: d.getDate(),
        monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
        sessions: dateSessions.sort((a, b) => a.groupName.localeCompare(b.groupName)),
        lockedStaffCount: dateSessions.filter((s) => s.isLockedStaff).length,
        cancelledCount: dateSessions.filter((s) => s.isCancelled).length,
      });
    }

    return groups.sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, areaFilter]);

  // Split upcoming vs past, group by month
  const { upcomingByMonth, pastByMonth } = useMemo(() => {
    const upcoming: DateGroup[] = [];
    const past: DateGroup[] = [];
    for (const dg of dateGroups) {
      if (isPast(dg.date)) past.push(dg);
      else upcoming.push(dg);
    }

    function groupByMonth(groups: DateGroup[]) {
      const map = new Map<string, DateGroup[]>();
      for (const dg of groups) {
        const d = new Date(dg.date + 'T12:00:00');
        const monthKey = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!map.has(monthKey)) map.set(monthKey, []);
        map.get(monthKey)!.push(dg);
      }
      return map;
    }

    return {
      upcomingByMonth: groupByMonth(upcoming),
      pastByMonth: groupByMonth(past.reverse()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateGroups]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function renderExpandedDate(dg: DateGroup) {
    return (
      <div className="ml-4 mt-1 mb-3 space-y-1 border-l-2 border-brand-navy/10 pl-4">
        {dg.sessions.map((session) => (
          <Link
            key={session.id}
            href={`/admin/madrich-attendance/session/${session.id}`}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-md bg-white border transition-all hover:border-brand-navy/30 hover:shadow-sm cursor-pointer',
              session.isLockedStaff && 'opacity-70'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                className={cn(
                  'text-xs border',
                  GROUP_AREA_COLORS[session.groupArea] || 'bg-gray-100 text-gray-600 border-gray-200'
                )}
              >
                {session.groupName}
              </Badge>
              {session.isLockedStaff && (
                <span className="text-[10px] text-amber-600 font-medium inline-flex items-center gap-0.5">
                  <Lock className="h-2.5 w-2.5" />
                  LOCKED
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-brand-muted">
              <ClipboardCheck className="h-4 w-4" />
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Staff Attendance</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Take attendance for madrichim and mazkirut. Click a date to expand,
            then click a group to mark.
          </p>
        </div>
        <Link
          href="/admin/madrich-attendance/upload"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-brand-dark-text shadow-sm hover:border-brand-navy/30 transition-all cursor-pointer"
        >
          <Upload className="h-4 w-4" />
          Upload from Excel
        </Link>
      </div>

      {/* Area filter */}
      <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-100 w-fit">
        <Filter className="ml-2 h-4 w-4 text-brand-muted" />
        {AREA_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAreaFilter(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              areaFilter === tab.key
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-dark-text hover:bg-gray-50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'Error'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !error && sessions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">No sessions yet</p>
            <p className="text-xs text-brand-muted mt-1">
              Generate the season in /admin/sessions to create sessions
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      {!isLoading && !error && upcomingByMonth.size > 0 && (
        <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider">
          Upcoming Sessions
        </h3>
      )}
      {!isLoading &&
        !error &&
        Array.from(upcomingByMonth.entries()).map(([month, dates]) => (
          <div key={month}>
            <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">
              {month}
            </h3>
            <div className="space-y-1.5">
              {dates.map((dg) => {
                const isExpanded = expandedDates.has(dg.date);
                const allLocked = dg.lockedStaffCount === dg.sessions.length;

                return (
                  <div key={dg.date}>
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                        allLocked && 'opacity-60 bg-gray-50/50 border-gray-200',
                        !allLocked && 'bg-white border-brand-navy/20 shadow-sm'
                      )}
                      onClick={() => toggleDate(dg.date)}
                    >
                      <div
                        className={cn(
                          'text-center w-12 flex-shrink-0 rounded-lg py-1',
                          allLocked ? 'bg-gray-100' : 'bg-brand-navy text-white'
                        )}
                      >
                        <p
                          className={cn(
                            'text-[10px] uppercase font-medium',
                            allLocked ? 'text-gray-500' : 'text-white/70'
                          )}
                        >
                          {dg.monthLabel}
                        </p>
                        <p
                          className={cn(
                            'text-lg font-bold',
                            allLocked ? 'text-gray-500' : 'text-white'
                          )}
                        >
                          {dg.dayNum}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-brand-dark-text">
                            {dg.dayLabel}
                          </span>
                          {dg.lockedStaffCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                              <Lock className="h-2.5 w-2.5 mr-0.5" />
                              {dg.lockedStaffCount} locked
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dg.sessions.map((s) => (
                            <span
                              key={s.id}
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                GROUP_AREA_COLORS[s.groupArea] ||
                                  'bg-gray-100 text-gray-600 border-gray-200'
                              )}
                            >
                              {s.groupName
                                .replace('Katan - ', 'K')
                                .replace('Noar - ', 'N')
                                .replace(' Grade', '')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-brand-muted">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      </div>
                    </div>
                    {isExpanded && renderExpandedDate(dg)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {/* Past */}
      {!isLoading && !error && pastByMonth.size > 0 && (
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-8">
          Past Sessions
        </h3>
      )}
      {!isLoading &&
        !error &&
        Array.from(pastByMonth.entries()).map(([month, dates]) => (
          <div key={month}>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {month}
            </h3>
            <div className="space-y-1.5">
              {dates.map((dg) => {
                const isExpanded = expandedDates.has(dg.date);
                const allLocked = dg.lockedStaffCount === dg.sessions.length;

                return (
                  <div key={dg.date}>
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                        allLocked && 'opacity-50 bg-gray-50/50 border-gray-200',
                        !allLocked && 'bg-gray-50/60 border-gray-200 opacity-80'
                      )}
                      onClick={() => toggleDate(dg.date)}
                    >
                      <div className="text-center w-12 flex-shrink-0 rounded-lg py-1 bg-gray-100">
                        <p className="text-[10px] uppercase font-medium text-gray-400">
                          {dg.monthLabel}
                        </p>
                        <p className="text-lg font-bold text-gray-400">{dg.dayNum}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-500">
                            {dg.dayLabel}
                          </span>
                          {dg.lockedStaffCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                              <Lock className="h-2.5 w-2.5 mr-0.5" />
                              {dg.lockedStaffCount} locked
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dg.sessions.map((s) => (
                            <span
                              key={s.id}
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                GROUP_AREA_COLORS[s.groupArea] ||
                                  'bg-gray-100 text-gray-600 border-gray-200'
                              )}
                            >
                              {s.groupName
                                .replace('Katan - ', 'K')
                                .replace('Noar - ', 'N')
                                .replace(' Grade', '')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-brand-muted">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      </div>
                    </div>
                    {isExpanded && renderExpandedDate(dg)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
