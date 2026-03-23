'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  Filter,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Upload,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ParticipantStats } from '@/lib/attendance/stats';

interface SessionHeader {
  id: string;
  date: string;
  isLocked: boolean;
  isCancelled: boolean;
  hasAttendance: boolean;
  isFuture: boolean;
}

interface StatsResponse {
  sessions: SessionHeader[];
  participants: ParticipantStats[];
}

interface GroupOption {
  id: string;
  name: string;
  slug: string;
  area: string;
}

function getDayAbbr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  if (day === 6) return 'Sat';
  if (day === 3) return 'Wed';
  if (day === 1) return 'Mon';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDayColor(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  if (day === 6) return 'text-blue-600';
  if (day === 3) return 'text-amber-600';
  if (day === 1) return 'text-emerald-600';
  return 'text-brand-muted';
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function getDayNum(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDate();
}

function getPercentageColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getPercentageBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-50';
  if (pct >= 60) return 'bg-amber-50';
  return 'bg-red-50';
}

const STATUS_COLORS: Record<string, { bg: string; ring: string; label: string }> = {
  present: { bg: 'bg-emerald-500', ring: 'ring-emerald-300', label: 'P' },
  late: { bg: 'bg-amber-400', ring: 'ring-amber-200', label: 'L' },
  excused: { bg: 'bg-gray-400', ring: 'ring-gray-200', label: 'E' },
};

function StatusCell({
  status,
  sessionId,
  participantId,
  onToggle,
}: {
  status: string | null;
  sessionId: string;
  participantId: string;
  onToggle: (sessionId: string, participantId: string, currentStatus: string | null) => void;
}) {
  const config = status ? STATUS_COLORS[status] : null;

  return (
    <button
      onClick={() => onToggle(sessionId, participantId, status)}
      className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:ring-2 hover:ring-offset-1 active:scale-95"
      title={`Click to change (current: ${status || 'none'})`}
    >
      {config ? (
        <span className={cn('w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white', config.bg, `hover:${config.ring}`)}>
          {config.label}
        </span>
      ) : (
        <span className="w-5 h-5 rounded-md bg-gray-100 border border-gray-200 border-dashed" />
      )}
    </button>
  );
}

export default function AdminAttendancePage() {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'percentage'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch groups
  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['admin-groups-options'],
    queryFn: async () => {
      const res = await fetch('/api/admin/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      const data = await res.json();
      return {
        groups: data.groups.map((g: { id: string; name: string; slug: string; area: string }) => ({
          id: g.id, name: g.name, slug: g.slug, area: g.area,
        })),
      };
    },
  });

  const groups = groupsData?.groups ?? [];
  const effectiveGroupId = selectedGroupId ?? groups[0]?.id ?? null;

  // Fetch attendance stats
  const { data: statsData, isLoading, error } = useQuery<StatsResponse>({
    queryKey: ['admin-attendance-stats', effectiveGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/attendance/stats?group_id=${effectiveGroupId}`);
      if (!res.ok) throw new Error('Failed to load attendance');
      return res.json();
    },
    enabled: !!effectiveGroupId,
  });

  const sessions = statsData?.sessions ?? [];
  const participants = statsData?.participants ?? [];

  // Toggle attendance mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ sessionId, participantId, currentStatus }: { sessionId: string; participantId: string; currentStatus: string | null }) => {
      const res = await fetch('/api/admin/attendance/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, participantId, currentStatus }),
      });
      if (!res.ok) throw new Error('Failed to toggle attendance');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats', effectiveGroupId] });
    },
  });

  // Session cancel/restore mutation
  const sessionMutation = useMutation({
    mutationFn: async ({ sessionId, isCancelled }: { sessionId: string; isCancelled: boolean }) => {
      const res = await fetch('/api/admin/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, is_cancelled: isCancelled }),
      });
      if (!res.ok) throw new Error('Failed to update session');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats', effectiveGroupId] });
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
  });

  const handleToggle = useCallback(
    (sessionId: string, participantId: string, currentStatus: string | null) => {
      toggleMutation.mutate({ sessionId, participantId, currentStatus });
    },
    [toggleMutation]
  );

  // Sort participants
  const sortedParticipants = useMemo(() => {
    const sorted = [...participants];
    if (sortBy === 'name') {
      sorted.sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
        return sortAsc ? cmp : -cmp;
      });
    } else {
      sorted.sort((a, b) => {
        const cmp = a.stats.percentage - b.stats.percentage;
        return sortAsc ? cmp : -cmp;
      });
    }
    return sorted;
  }, [participants, sortBy, sortAsc]);

  // Group sessions by month for header
  const sessionsByMonth = useMemo(() => {
    const groups: { month: string; sessions: SessionHeader[] }[] = [];
    let currentMonth = '';
    for (const s of sessions) {
      const month = getMonthLabel(s.date);
      if (month !== currentMonth) {
        groups.push({ month, sessions: [s] });
        currentMonth = month;
      } else {
        groups[groups.length - 1].sessions.push(s);
      }
    }
    return groups;
  }, [sessions]);

  // Track which session IDs are the first in their month (for border)
  const firstInMonth = useMemo(() => {
    const set = new Set<string>();
    for (const mg of sessionsByMonth) {
      if (mg.sessions.length > 0) set.add(mg.sessions[0].id);
    }
    return set;
  }, [sessionsByMonth]);

  // Summary stats
  const avgPercentage = participants.length > 0
    ? Math.round(participants.reduce((s, p) => s + p.stats.percentage, 0) / participants.length)
    : 0;
  const flaggedCount = participants.filter((p) => p.consecutiveAbsences >= 2).length;

  function toggleSort(field: 'name' | 'percentage') {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(field === 'name'); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !effectiveGroupId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('group_id', effectiveGroupId);
      const res = await fetch('/api/admin/attendance/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(`Imported ${data.imported} records. ${data.skipped?.length ? `Skipped: ${data.skipped.join(', ')}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats', effectiveGroupId] });
    } catch (err) {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Import failed'}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const CELL_W = 32; // px per session column
  const NAME_W = 220;
  const PCT_W = 56;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Attendance</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Click any cell to cycle: P → L → E → clear. Empty = absent.
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || !effectiveGroupId}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import XLSX
          </Button>
        </div>
      </div>

      {importResult && (
        <div className={cn(
          'rounded-lg px-4 py-3 text-sm',
          importResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        )}>
          {importResult}
        </div>
      )}

      {/* Group selector */}
      <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-100 flex-wrap">
        <Filter className="ml-2 h-4 w-4 text-brand-muted" />
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGroupId(g.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              effectiveGroupId === g.id
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-dark-text hover:bg-gray-50'
            )}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!isLoading && !error && effectiveGroupId && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-5 w-5 text-brand-navy" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{participants.length}</p>
                <p className="text-xs text-brand-muted">Participants</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{sessions.filter(s => !s.isCancelled).length}</p>
                <p className="text-xs text-brand-muted">Active Sessions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <div>
                <p className={cn('text-2xl font-bold', getPercentageColor(avgPercentage))}>{avgPercentage}%</p>
                <p className="text-xs text-brand-muted">Avg Attendance</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className={cn('h-5 w-5', flaggedCount > 0 ? 'text-red-500' : 'text-gray-300')} />
              <div>
                <p className={cn('text-2xl font-bold', flaggedCount > 0 ? 'text-red-600' : 'text-brand-dark-text')}>{flaggedCount}</p>
                <p className="text-xs text-brand-muted">2+ absences</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'Error'}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && effectiveGroupId && sessions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">No attendance data yet</p>
            <p className="text-xs text-brand-muted mt-1">Generate sessions and take attendance to see stats here</p>
          </CardContent>
        </Card>
      )}

      {/* Attendance grid */}
      {!isLoading && !error && sessions.length > 0 && (
        <Card>
          <CardContent className="py-4 px-0">
            <div className="overflow-auto max-h-[calc(100vh-280px)]">
              <table className="text-xs border-collapse" style={{ minWidth: `${NAME_W + PCT_W + sessions.length * CELL_W}px` }}>
                <thead className="sticky top-0 z-30 bg-white">
                  {/* Month row */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: PCT_W }} className="sticky left-[220px] z-40 bg-white" />
                    {sessionsByMonth.map((mg) => (
                      <th
                        key={mg.month}
                        colSpan={mg.sessions.length}
                        className="text-center font-bold text-brand-navy text-xs pb-1 border-b-2 border-brand-navy/20"
                      >
                        {mg.month}
                      </th>
                    ))}
                  </tr>
                  {/* Day type row (Sat/Wed/Mon) */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: PCT_W }} className="sticky left-[220px] z-40 bg-white" />
                    {sessions.map((s) => (
                      <th key={s.id + '-day'} style={{ width: CELL_W }} className={cn(
                        'text-center pb-0.5',
                        s.isCancelled && 'bg-red-50/50',
                        s.isFuture && !s.isCancelled && 'bg-blue-50/50',
                        !s.isCancelled && !s.isFuture && !s.hasAttendance && 'bg-amber-50/50'
                      )}>
                        <span className={cn(
                          'text-[9px] font-bold',
                          s.isCancelled ? 'text-red-300' : s.isFuture ? 'text-blue-400' : !s.hasAttendance ? 'text-amber-400' : getDayColor(s.date)
                        )}>
                          {getDayAbbr(s.date)}
                        </span>
                      </th>
                    ))}
                  </tr>
                  {/* Date number row + cancel/restore toggle */}
                  <tr className="border-b-2 border-gray-200">
                    <th
                      style={{ minWidth: NAME_W }}
                      className="sticky left-0 z-40 bg-white pb-2 pl-4 pr-2 text-left font-semibold text-brand-dark-text text-xs cursor-pointer hover:text-brand-navy select-none"
                      onClick={() => toggleSort('name')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Name
                        {sortBy === 'name' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    <th
                      style={{ minWidth: PCT_W }}
                      className="sticky left-[220px] z-40 bg-white pb-2 px-1 text-center font-semibold text-brand-dark-text text-xs cursor-pointer hover:text-brand-navy select-none"
                      onClick={() => toggleSort('percentage')}
                    >
                      <span className="inline-flex items-center gap-1">
                        %
                        {sortBy === 'percentage' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    {sessions.map((s) => (
                      <th key={s.id} style={{ width: CELL_W }} className={cn(
                        'pb-2 text-center',
                        s.isCancelled && 'bg-red-50/50',
                        s.isFuture && !s.isCancelled && 'bg-blue-50/50',
                        !s.isCancelled && !s.isFuture && !s.hasAttendance && 'bg-amber-50/50'
                      )}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn(
                            'font-medium text-[10px]',
                            s.isCancelled ? 'text-red-400 line-through' : s.isFuture ? 'text-blue-400' : !s.hasAttendance ? 'text-amber-400' : 'text-brand-muted'
                          )}>
                            {getDayNum(s.date)}
                          </span>
                          <button
                            onClick={() => sessionMutation.mutate({ sessionId: s.id, isCancelled: !s.isCancelled })}
                            className={cn(
                              'w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors',
                              s.isCancelled
                                ? 'text-red-400 hover:text-emerald-500 hover:bg-emerald-50'
                                : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                            )}
                            title={s.isCancelled ? 'Restore session' : 'Cancel session'}
                          >
                            {s.isCancelled ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParticipants.map((p) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b border-gray-50 hover:bg-gray-50/50 transition-colors',
                        p.consecutiveAbsences >= 2 && 'bg-red-50/40'
                      )}
                    >
                      <td style={{ minWidth: NAME_W }} className="sticky left-0 z-10 bg-white py-1 pl-4 pr-2 whitespace-nowrap">
                        <span className="font-medium text-xs text-brand-dark-text">
                          {p.lastName}, {p.firstName}
                        </span>
                        {p.consecutiveAbsences >= 2 && (
                          <Badge className="ml-1.5 bg-red-100 text-red-700 text-[8px] px-1 py-0">
                            {p.consecutiveAbsences}x
                          </Badge>
                        )}
                      </td>
                      <td style={{ minWidth: PCT_W }} className="sticky left-[220px] z-10 bg-white py-1 px-1 text-center border-r-2 border-gray-200">
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[10px] font-bold',
                          getPercentageColor(p.stats.percentage),
                          getPercentageBg(p.stats.percentage)
                        )}>
                          {p.stats.percentage}%
                        </span>
                      </td>
                      {sessions.map((s) => (
                        <td key={s.id} style={{ width: CELL_W }} className={cn(
                          'py-1 text-center',
                          firstInMonth.has(s.id) && 'border-l-2 border-brand-navy/15',
                          s.isCancelled && 'bg-red-50/30',
                          s.isFuture && !s.isCancelled && 'bg-blue-50/30',
                          !s.isCancelled && !s.isFuture && !s.hasAttendance && 'bg-amber-50/30'
                        )}>
                          {s.isCancelled ? (
                            <span className="w-5 h-5 inline-block text-red-300" title="Cancelled">—</span>
                          ) : s.isFuture ? (
                            <span className="w-5 h-5 inline-block text-blue-200" title="Future">·</span>
                          ) : (
                          <StatusCell
                            status={p.records[s.id]}
                            sessionId={s.id}
                            participantId={p.id}
                            onToggle={handleToggle}
                          />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 mx-4 border-t border-gray-100 flex items-center gap-4 text-xs text-brand-muted flex-wrap">
              {Object.entries(STATUS_COLORS).map(([key, val]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className={cn('w-4 h-4 rounded-md text-white text-[9px] font-bold flex items-center justify-center', val.bg)}>
                    {val.label}
                  </span>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-md bg-gray-100 border border-gray-200 border-dashed" />
                Absent (no record)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-md bg-amber-50 border border-amber-200 text-[9px]" />
                No attendance taken
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-md bg-blue-50 border border-blue-200 text-blue-300 text-[9px] flex items-center justify-center">·</span>
                Future
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-md bg-red-50 text-red-300 text-[9px] flex items-center justify-center">—</span>
                Cancelled
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
