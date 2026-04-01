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
  UserX,
  UserCheck,
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

interface EventHeader {
  id: string;
  name: string;
  date: string;
  hours: number;
}

// Unified column type for chronological grid
type GridColumn =
  | { type: 'session'; data: SessionHeader }
  | { type: 'event'; data: EventHeader };

interface StatsResponse {
  sessions: SessionHeader[];
  participants: ParticipantStats[];
  events?: EventHeader[];
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
  const events = statsData?.events ?? [];

  // Merge sessions and events into chronological order
  const gridColumns = useMemo(() => {
    const cols: GridColumn[] = [];
    for (const s of sessions) cols.push({ type: 'session', data: s });
    for (const e of events) cols.push({ type: 'event', data: e });
    cols.sort((a, b) => a.data.date.localeCompare(b.data.date));
    return cols;
  }, [sessions, events]);

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

  // Dropout toggle mutation
  const dropoutMutation = useMutation({
    mutationFn: async ({ participantId, isDropout }: { participantId: string; isDropout: boolean }) => {
      const res = await fetch('/api/admin/attendance/dropout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, groupId: effectiveGroupId, isDropout }),
      });
      if (!res.ok) throw new Error('Failed to toggle dropout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-stats', effectiveGroupId] });
    },
  });

  const handleToggle = useCallback(
    (sessionId: string, participantId: string, currentStatus: string | null) => {
      toggleMutation.mutate({ sessionId, participantId, currentStatus });
    },
    [toggleMutation]
  );

  // Split active and dropout, sort each
  const { activeParticipants, dropoutParticipants } = useMemo(() => {
    const active = participants.filter((p) => !p.isDropout);
    const dropout = participants.filter((p) => p.isDropout);

    const sortFn = (a: ParticipantStats, b: ParticipantStats) => {
      if (sortBy === 'name') {
        const cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
        return sortAsc ? cmp : -cmp;
      } else {
        const cmp = a.stats.percentage - b.stats.percentage;
        return sortAsc ? cmp : -cmp;
      }
    };

    active.sort(sortFn);
    dropout.sort(sortFn);
    return { activeParticipants: active, dropoutParticipants: dropout };
  }, [participants, sortBy, sortAsc]);

  const sortedParticipants = activeParticipants;

  // Group columns by month for header
  const columnsByMonth = useMemo(() => {
    const groups: { month: string; columns: GridColumn[] }[] = [];
    let currentMonth = '';
    for (const col of gridColumns) {
      const month = getMonthLabel(col.data.date);
      if (month !== currentMonth) {
        groups.push({ month, columns: [col] });
        currentMonth = month;
      } else {
        groups[groups.length - 1].columns.push(col);
      }
    }
    return groups;
  }, [gridColumns]);

  // Track which columns are first in their month (for border)
  const firstInMonth = useMemo(() => {
    const set = new Set<number>();
    for (const mg of columnsByMonth) {
      const idx = gridColumns.indexOf(mg.columns[0]);
      if (idx >= 0) set.add(idx);
    }
    return set;
  }, [columnsByMonth, gridColumns]);

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

  // Compute per-session totals (present+late count and percentage)
  const sessionTotals = useMemo(() => {
    const totalActive = activeParticipants.length;
    const totals: Record<string, { present: number; total: number; pct: number }> = {};

    for (const col of gridColumns) {
      if (col.type !== 'session') continue;
      const s = col.data as SessionHeader;
      if (s.isCancelled || s.isFuture || !s.hasAttendance) continue;

      let present = 0;
      for (const p of activeParticipants) {
        const status = p.records[s.id];
        if (status === 'present' || status === 'late') present++;
      }
      const pct = totalActive > 0 ? Math.round((present / totalActive) * 100) : 0;
      totals[s.id] = { present, total: totalActive, pct };
    }
    return totals;
  }, [gridColumns, activeParticipants]);

  const CELL_W = 32; // px per session column
  const EVENT_W = 32; // px per event column (same as sessions, name shown on hover)
  const NAME_W = 220;
  const PCT_W = 56;

  function getColWidth(col: GridColumn) { return col.type === 'event' ? EVENT_W : CELL_W; }
  function getColId(col: GridColumn) { return col.type === 'event' ? 'ev-' + col.data.id : col.data.id; }
  const totalGridWidth = gridColumns.reduce((w, col) => w + getColWidth(col), 0);

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
                <p className="text-2xl font-bold text-brand-dark-text">{activeParticipants.length}</p>
                <p className="text-xs text-brand-muted">Active{dropoutParticipants.length > 0 ? ` (+${dropoutParticipants.length} dropout)` : ''}</p>
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
              <table className="text-xs border-collapse" style={{ minWidth: `${NAME_W + PCT_W + totalGridWidth}px` }}>
                <thead className="sticky top-0 z-30 bg-white">
                  {/* Month row */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: PCT_W }} className="sticky left-[220px] z-40 bg-white" />
                    {columnsByMonth.map((mg) => (
                      <th
                        key={mg.month}
                        colSpan={mg.columns.length}
                        className="text-center font-bold text-brand-navy text-xs pb-1 border-b-2 border-brand-navy/20"
                      >
                        {mg.month}
                      </th>
                    ))}
                  </tr>
                  {/* Day type / event name row */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: PCT_W }} className="sticky left-[220px] z-40 bg-white" />
                    {gridColumns.map((col) => col.type === 'session' ? (
                      <th key={getColId(col) + '-day'} style={{ width: CELL_W }} className={cn(
                        'text-center pb-0.5',
                        col.data.isCancelled && 'bg-red-50/50',
                        col.data.isFuture && !col.data.isCancelled && 'bg-blue-50/50',
                        !col.data.isCancelled && !col.data.isFuture && !col.data.hasAttendance && 'bg-amber-50/50'
                      )}>
                        <span className={cn(
                          'text-[9px] font-bold',
                          col.data.isCancelled ? 'text-red-300' : col.data.isFuture ? 'text-blue-400' : !col.data.hasAttendance ? 'text-amber-400' : getDayColor(col.data.date)
                        )}>
                          {getDayAbbr(col.data.date)}
                        </span>
                      </th>
                    ) : (
                      <th key={getColId(col) + '-day'} style={{ width: EVENT_W }} className="text-center pb-0.5 bg-purple-50/60 border-l border-r border-purple-200" title={(col.data as EventHeader).name}>
                        <span className="text-[9px] font-bold text-purple-500">★</span>
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
                    {gridColumns.map((col) => col.type === 'session' ? (
                      <th key={getColId(col)} style={{ width: CELL_W }} className={cn(
                        'pb-2 text-center',
                        col.data.isCancelled && 'bg-red-50/50',
                        col.data.isFuture && !col.data.isCancelled && 'bg-blue-50/50',
                        !col.data.isCancelled && !col.data.isFuture && !col.data.hasAttendance && 'bg-amber-50/50'
                      )}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn(
                            'font-medium text-[10px]',
                            col.data.isCancelled ? 'text-red-400 line-through' : col.data.isFuture ? 'text-blue-400' : !col.data.hasAttendance ? 'text-amber-400' : 'text-brand-muted'
                          )}>
                            {getDayNum(col.data.date)}
                          </span>
                          <button
                            onClick={() => sessionMutation.mutate({ sessionId: col.data.id, isCancelled: !col.data.isCancelled })}
                            className={cn(
                              'w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors',
                              col.data.isCancelled
                                ? 'text-red-400 hover:text-emerald-500 hover:bg-emerald-50'
                                : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                            )}
                            title={col.data.isCancelled ? 'Restore session' : 'Cancel session'}
                          >
                            {col.data.isCancelled ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </th>
                    ) : (
                      <th key={getColId(col)} style={{ width: EVENT_W }} className="pb-2 text-center bg-purple-50/60 border-l border-r border-purple-200" title={(col.data as EventHeader).name + ' (' + (col.data as EventHeader).hours + 'h)'}>
                        <span className="font-medium text-[9px] text-purple-600">
                          {getDayNum(col.data.date)}
                        </span>
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => dropoutMutation.mutate({ participantId: p.id, isDropout: true })}
                            className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors flex-shrink-0"
                            title="Mark as dropout"
                          >
                            <UserX className="h-3 w-3" />
                          </button>
                          <span className="font-medium text-xs text-brand-dark-text truncate">
                            {p.lastName}, {p.firstName}
                          </span>
                          {p.consecutiveAbsences >= 2 && (
                            <Badge className="ml-0.5 bg-red-100 text-red-700 text-[8px] px-1 py-0 flex-shrink-0">
                              {p.consecutiveAbsences}x
                            </Badge>
                          )}
                        </div>
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
                      {gridColumns.map((col, colIdx) => col.type === 'session' ? (
                        <td key={getColId(col)} style={{ width: CELL_W }} className={cn(
                          'py-1 text-center',
                          firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15',
                          col.data.isCancelled && 'bg-red-50/30',
                          col.data.isFuture && !col.data.isCancelled && 'bg-blue-50/30',
                          !col.data.isCancelled && !col.data.isFuture && !col.data.hasAttendance && 'bg-amber-50/30'
                        )}>
                          {col.data.isCancelled ? (
                            <span className="w-5 h-5 inline-block text-red-300" title="Cancelled">—</span>
                          ) : col.data.isFuture ? (
                            <span className="w-5 h-5 inline-block text-blue-200" title="Future">·</span>
                          ) : (
                          <StatusCell
                            status={p.records[col.data.id]}
                            sessionId={col.data.id}
                            participantId={p.id}
                            onToggle={handleToggle}
                          />
                          )}
                        </td>
                      ) : (
                        <td key={getColId(col)} style={{ width: EVENT_W }} className="py-1 text-center bg-purple-50/20 border-l border-r border-purple-100/50">
                          {p.eventRecords?.[(col.data as EventHeader).id] ? (
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-purple-500 mx-auto" title={(col.data as EventHeader).name}>
                              ✓
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-md bg-gray-100 border border-gray-200 border-dashed mx-auto block" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Dropout separator */}
                  {dropoutParticipants.length > 0 && (
                    <tr>
                      <td colSpan={2 + sessions.length} className="sticky left-0 z-10 bg-gray-100 py-2 pl-4">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Dropouts ({dropoutParticipants.length})
                        </span>
                      </td>
                    </tr>
                  )}
                  {dropoutParticipants.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 opacity-50"
                    >
                      <td style={{ minWidth: NAME_W }} className="sticky left-0 z-10 bg-white py-1 pl-4 pr-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => dropoutMutation.mutate({ participantId: p.id, isDropout: false })}
                            className="p-0.5 rounded text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 cursor-pointer transition-colors flex-shrink-0"
                            title="Restore to active"
                          >
                            <UserCheck className="h-3 w-3" />
                          </button>
                          <span className="font-medium text-xs text-gray-400 truncate">
                            {p.lastName}, {p.firstName}
                          </span>
                          <Badge className="ml-0.5 bg-gray-100 text-gray-500 text-[8px] px-1 py-0 flex-shrink-0">
                            dropout
                          </Badge>
                        </div>
                      </td>
                      <td style={{ minWidth: PCT_W }} className="sticky left-[220px] z-10 bg-white py-1 px-1 text-center border-r-2 border-gray-200">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-400 bg-gray-50">
                          {p.stats.percentage}%
                        </span>
                      </td>
                      {gridColumns.map((col, colIdx) => col.type === 'session' ? (
                        <td key={getColId(col)} style={{ width: CELL_W }} className={cn(
                          'py-1 text-center',
                          firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15',
                        )}>
                          {p.records[col.data.id] ? (
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-gray-400 mx-auto">
                              {STATUS_COLORS[p.records[col.data.id]!]?.label || '?'}
                            </span>
                          ) : null}
                        </td>
                      ) : (
                        <td key={getColId(col)} style={{ width: EVENT_W }} className="py-1 text-center bg-purple-50/10 border-l border-r border-purple-100/50">
                          {p.eventRecords?.[(col.data as EventHeader).id] ? (
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-gray-400 mx-auto">✓</span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td style={{ minWidth: NAME_W }} className="sticky left-0 z-10 bg-gray-50 py-2 pl-4 pr-2 whitespace-nowrap">
                      <span className="font-bold text-xs text-brand-navy uppercase tracking-wider">Totals</span>
                    </td>
                    <td style={{ minWidth: PCT_W }} className="sticky left-[220px] z-10 bg-gray-50 py-2 px-1 text-center border-r-2 border-gray-200" />
                    {gridColumns.map((col, colIdx) => {
                      if (col.type === 'event') {
                        return <td key={getColId(col) + '-total'} style={{ width: EVENT_W }} className="py-2 text-center bg-purple-50/20 border-l border-r border-purple-100/50" />;
                      }
                      const s = col.data as SessionHeader;
                      const stats = sessionTotals[s.id];
                      if (!stats) {
                        return (
                          <td key={getColId(col) + '-total'} style={{ width: CELL_W }} className={cn(
                            'py-2 text-center',
                            firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15',
                            s.isCancelled && 'bg-red-50/30',
                            s.isFuture && 'bg-blue-50/30',
                          )} />
                        );
                      }
                      return (
                        <td
                          key={getColId(col) + '-total'}
                          style={{ width: CELL_W }}
                          className={cn(
                            'py-1 text-center',
                            firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15',
                          )}
                          title={`${stats.present}/${stats.total} (${stats.pct}%)`}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[9px] font-bold text-brand-dark-text">{stats.present}</span>
                            <span className={cn(
                              'text-[8px] font-semibold',
                              getPercentageColor(stats.pct)
                            )}>
                              {stats.pct}%
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
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
