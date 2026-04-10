'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  AlertTriangle,
  Loader2,
  Ban,
  CheckCircle2,
  Lock,
  Unlock,
  Sparkles,
  Filter,
  Users,
  ChevronDown,
  ChevronRight,
  XCircle,
  RotateCcw,
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
  activeCount: number;
  cancelledCount: number;
  totalAttendance: number;
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

export default function AdminSessionsPage() {
  const queryClient = useQueryClient();
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ['admin-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const sessions = data?.sessions ?? [];

  const isPast = (date: string) => new Date(date + 'T23:59:59') < new Date();

  const toggleMutation = useMutation({
    mutationFn: async ({ sessionId, field, value, title }: { sessionId: string; field: string; value: boolean; title?: string }) => {
      const body: Record<string, unknown> = { sessionId, [field]: value };
      if (title !== undefined) body.title = title;
      const res = await fetch('/api/admin/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update session');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      // Cross-invalidate staff attendance + chanichim attendance views so
      // cancelled sessions show up as cancelled there too without waiting
      // for the user to refresh.
      queryClient.invalidateQueries({ queryKey: ['staff-by-area'] });
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats'] });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async ({ sessionIds, field, value }: { sessionIds: string[]; field: string; value: boolean }) => {
      const res = await fetch('/api/admin/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds, [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to update sessions');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-by-area'] });
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats'] });
    },
  });

  // Group sessions by date
  const dateGroups = useMemo(() => {
    const filtered = areaFilter === 'all' ? sessions : sessions.filter((s) => s.groupArea === areaFilter);
    const map = new Map<string, SessionRow[]>();

    for (const s of filtered) {
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
        activeCount: dateSessions.filter((s) => !s.isCancelled).length,
        cancelledCount: dateSessions.filter((s) => s.isCancelled).length,
        totalAttendance: dateSessions.reduce((sum, s) => sum + s.attendanceCount, 0),
      });
    }

    return groups.sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, areaFilter]);

  // Split into upcoming and past, group by month
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
  }, [dateGroups]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function cancelAllForDate(dateGroup: DateGroup) {
    const activeIds = dateGroup.sessions.filter((s) => !s.isCancelled).map((s) => s.id);
    if (activeIds.length === 0) return;
    batchMutation.mutate({ sessionIds: activeIds, field: 'is_cancelled', value: true });
  }

  function restoreAllForDate(dateGroup: DateGroup) {
    const cancelledIds = dateGroup.sessions.filter((s) => s.isCancelled).map((s) => s.id);
    if (cancelledIds.length === 0) return;
    batchMutation.mutate({ sessionIds: cancelledIds, field: 'is_cancelled', value: false });
  }

  async function handleGenerate() {
    if (!confirm('Generate sessions for the 2025-2026 season?\n\nThis will create sessions from Sep 13, 2025 to May 16, 2026 for all groups based on their schedules.\n\nExisting sessions will not be duplicated.')) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/admin/sessions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonStart: '2025-09-13', seasonEnd: '2026-05-16' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(`Created ${data.created} sessions (${data.totalGenerated} total generated)`);
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
    } catch (err) {
      setGenResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  }

  function renderExpandedDate(dg: DateGroup) {
    return (
      <div className="ml-4 mt-1 mb-3 space-y-1 border-l-2 border-brand-navy/10 pl-4">
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); cancelAllForDate(dg); }}
            disabled={dg.cancelledCount === dg.sessions.length || batchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <XCircle className="h-3.5 w-3.5" />Cancel All
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); restoreAllForDate(dg); }}
            disabled={dg.cancelledCount === 0 || batchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />Restore All
          </button>
          <span className="w-px h-4 bg-gray-200" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              const unlocked = dg.sessions.filter(s => !s.isLocked && !s.isCancelled).map(s => s.id);
              if (unlocked.length > 0) batchMutation.mutate({ sessionIds: unlocked, field: 'is_locked', value: true });
            }}
            disabled={dg.sessions.filter(s => !s.isLocked && !s.isCancelled).length === 0 || batchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5" />Lock All
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const locked = dg.sessions.filter(s => s.isLocked && !s.isCancelled).map(s => s.id);
              if (locked.length > 0) batchMutation.mutate({ sessionIds: locked, field: 'is_locked', value: false });
            }}
            disabled={dg.sessions.filter(s => s.isLocked && !s.isCancelled).length === 0 || batchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Unlock className="h-3.5 w-3.5" />Unlock All
          </button>
        </div>
        {dg.sessions.map((session) => (
          <div key={session.id} className={cn('flex items-center justify-between px-3 py-2 rounded-md bg-white border transition-opacity', session.isCancelled && 'opacity-50 bg-red-50/50 border-red-100')}>
            <div className="flex items-center gap-2 min-w-0">
              <Badge className={cn('text-xs border', session.isCancelled ? 'bg-gray-50 text-gray-400 border-gray-200' : GROUP_AREA_COLORS[session.groupArea] || 'bg-gray-100 text-gray-600 border-gray-200')}>{session.groupName}</Badge>
              {session.isCancelled && (
                <span className="text-[10px] text-red-500 font-medium">CANCELLED{session.title ? `: ${session.title}` : ''}</span>
              )}
              {session.isLocked && <Lock className="h-3 w-3 text-amber-500" />}
              {session.attendanceCount > 0 && <span className="text-[10px] text-brand-muted flex items-center gap-0.5"><Users className="h-3 w-3" />{session.attendanceCount}</span>}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (session.isCancelled) {
                    toggleMutation.mutate({ sessionId: session.id, field: 'is_cancelled', value: false, title: '' });
                  } else {
                    const reason = prompt(`Why is this session being cancelled?\n(${session.groupName} - ${session.sessionDate})`);
                    if (reason !== null) {
                      toggleMutation.mutate({ sessionId: session.id, field: 'is_cancelled', value: true, title: reason || 'Cancelled' });
                    }
                  }
                }}
                className={cn('p-1.5 rounded-md transition-colors cursor-pointer', session.isCancelled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-500 hover:bg-red-50')}
                title={session.isCancelled ? 'Restore' : 'Cancel'}
              >
                {session.isCancelled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMutation.mutate({ sessionId: session.id, field: 'is_locked', value: !session.isLocked });
                }}
                className={cn('p-1.5 rounded-md transition-colors cursor-pointer', session.isLocked ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-50')}
                title={session.isLocked ? 'Unlock' : 'Lock'}
              >
                {session.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Sessions</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Manage session calendar. Cancel or block dates for holidays.
        </p>
      </div>

      <Button onClick={handleGenerate} disabled={generating} variant="outline">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {generating ? 'Generating...' : 'Generate Season'}
      </Button>

      {genResult && (
        <div className={cn(
          'rounded-lg px-4 py-3 text-sm',
          genResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        )}>
          {genResult}
        </div>
      )}

      {/* Area Filter */}
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
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'Error'}</p>
          </CardContent>
        </Card>
      )}

      {/* No sessions */}
      {!isLoading && !error && sessions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">No sessions yet</p>
            <p className="text-xs text-brand-muted mt-1">Click &quot;Generate Season&quot; to create sessions from schedules</p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming sessions */}
      {!isLoading && !error && upcomingByMonth.size > 0 && (
        <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider">Upcoming Sessions</h3>
      )}
      {!isLoading && !error && Array.from(upcomingByMonth.entries()).map(([month, dates]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">{month}</h3>
          <div className="space-y-1.5">
            {dates.map((dg) => {
              const isExpanded = expandedDates.has(dg.date);
              const allCancelled = dg.cancelledCount === dg.sessions.length;
              const someCancelled = dg.cancelledCount > 0 && !allCancelled;
              const past = false;

              return (
                <div key={dg.date}>
                  {/* Date row — same JSX as below, duplicated for upcoming */}
                  <div
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                      allCancelled && 'opacity-40 bg-red-50/30 border-red-100',
                      !allCancelled && 'bg-white border-brand-navy/20 shadow-sm',
                    )}
                    onClick={() => toggleDate(dg.date)}
                  >
                    <div className={cn('text-center w-12 flex-shrink-0 rounded-lg py-1', allCancelled ? 'bg-red-50' : 'bg-brand-navy text-white')}>
                      <p className={cn('text-[10px] uppercase font-medium', allCancelled ? 'text-brand-muted' : 'text-white/70')}>{dg.monthLabel}</p>
                      <p className={cn('text-lg font-bold', allCancelled ? 'text-red-400' : 'text-white')}>{dg.dayNum}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-brand-dark-text">{dg.dayLabel}</span>
                        {allCancelled && <Badge className="bg-red-100 text-red-600 text-[10px]">All Cancelled</Badge>}
                        {someCancelled && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{dg.cancelledCount} cancelled</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dg.sessions.map((s) => (
                          <span key={s.id} className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', s.isCancelled ? 'bg-gray-50 text-gray-400 border-gray-200 line-through' : GROUP_AREA_COLORS[s.groupArea] || 'bg-gray-100 text-gray-600 border-gray-200')}>
                            {s.groupName.replace('Katan - ', 'K').replace('Noar - ', 'N').replace(' Grade', '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {dg.totalAttendance > 0 && <span className="text-xs text-brand-muted flex items-center gap-1"><Users className="h-3 w-3" />{dg.totalAttendance}</span>}
                      <span className="text-brand-muted">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                    </div>
                  </div>
                  {isExpanded && renderExpandedDate(dg)}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Past sessions */}
      {!isLoading && !error && pastByMonth.size > 0 && (
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-8">Past Sessions</h3>
      )}
      {!isLoading && !error && Array.from(pastByMonth.entries()).map(([month, dates]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{month}</h3>
          <div className="space-y-1.5">
            {dates.map((dg) => {
              const isExpanded = expandedDates.has(dg.date);
              const allCancelled = dg.cancelledCount === dg.sessions.length;
              const someCancelled = dg.cancelledCount > 0 && !allCancelled;

              return (
                <div key={dg.date}>
                  <div
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                      allCancelled && 'opacity-40 bg-red-50/30 border-red-100',
                      !allCancelled && 'bg-gray-50/60 border-gray-200 opacity-70',
                    )}
                    onClick={() => toggleDate(dg.date)}
                  >
                    <div className={cn('text-center w-12 flex-shrink-0 rounded-lg py-1', allCancelled ? 'bg-red-50' : 'bg-gray-100')}>
                      <p className={cn('text-[10px] uppercase font-medium', allCancelled ? 'text-brand-muted' : 'text-gray-400')}>{dg.monthLabel}</p>
                      <p className={cn('text-lg font-bold', allCancelled ? 'text-red-400' : 'text-gray-400')}>{dg.dayNum}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-500">{dg.dayLabel}</span>
                        {allCancelled && <Badge className="bg-red-100 text-red-600 text-[10px]">All Cancelled</Badge>}
                        {someCancelled && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{dg.cancelledCount} cancelled</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dg.sessions.map((s) => (
                          <span key={s.id} className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', s.isCancelled ? 'bg-gray-50 text-gray-400 border-gray-200 line-through' : GROUP_AREA_COLORS[s.groupArea] || 'bg-gray-100 text-gray-600 border-gray-200')}>
                            {s.groupName.replace('Katan - ', 'K').replace('Noar - ', 'N').replace(' Grade', '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {dg.totalAttendance > 0 && <span className="text-xs text-brand-muted flex items-center gap-1"><Users className="h-3 w-3" />{dg.totalAttendance}</span>}
                      <span className="text-brand-muted">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
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
