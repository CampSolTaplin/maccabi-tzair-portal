'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
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
  ChevronLeft,
  ChevronRight,
  Upload,
  Ban,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Status = 'present' | 'late' | 'excused';

interface SessionRow {
  id: string;
  groupId: string;
  groupName: string;
  groupSlug: string;
  date: string;
  isCancelled: boolean;
  isLocked: boolean;
  hasAttendance: boolean;
  isFuture: boolean;
}

interface StaffParticipant {
  id: string;
  firstName: string;
  lastName: string;
  role: 'madrich' | 'mazkirut';
  primaryGroupId: string | null;
  primaryGroupName: string | null;
  groupIds: string[];
  records: Record<string, Status>;
  eventRecords: Record<string, boolean>;
  stats: { percentage: number; present: number; total: number };
}

interface EventHeader {
  id: string;
  name: string;
  date: string;
  hours: number;
}

interface StaffAreaResponse {
  area: string;
  sessions: SessionRow[];
  participants: StaffParticipant[];
  events: EventHeader[];
}

type AreaKey = 'katan' | 'noar' | 'pre-som' | 'som';

const AREA_TABS: { key: AreaKey; label: string }[] = [
  { key: 'katan', label: 'Katan' },
  { key: 'noar', label: 'Noar' },
  { key: 'pre-som', label: 'Pre-SOM' },
  { key: 'som', label: 'SOM' },
];

function getDayAbbr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  if (day === 6) return 'Sat';
  if (day === 3) return 'Wed';
  if (day === 1) return 'Mon';
  if (day === 2) return 'Tue';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDayColor(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  if (day === 6) return 'text-blue-600';
  if (day === 3) return 'text-amber-600';
  if (day === 1) return 'text-emerald-600';
  if (day === 2) return 'text-rose-600';
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

const STATUS_COLORS: Record<Status, { bg: string; label: string }> = {
  present: { bg: 'bg-emerald-500', label: 'P' },
  late: { bg: 'bg-amber-400', label: 'L' },
  excused: { bg: 'bg-gray-400', label: 'E' },
};

/**
 * A grid column represents a unique session date. Multiple sessions (from
 * different sub-groups) can share the same date; we keep all their ids so
 * we can look up the right session for each member by their group
 * membership.
 */
interface DateColumn {
  date: string;
  isFuture: boolean;
  sessionsByGroup: Record<string, { id: string; isCancelled: boolean; isLocked: boolean; hasAttendance: boolean }>;
}

function StatusCell({
  status,
  sessionId,
  participantId,
  onToggle,
}: {
  status: Status | null;
  sessionId: string;
  participantId: string;
  onToggle: (sessionId: string, participantId: string, currentStatus: Status | null) => void;
}) {
  const config = status ? STATUS_COLORS[status] : null;
  return (
    <button
      onClick={() => onToggle(sessionId, participantId, status)}
      className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:ring-2 hover:ring-offset-1 active:scale-95"
      title={`Click to change (current: ${status || 'none'})`}
    >
      {config ? (
        <span className={cn('w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white', config.bg)}>
          {config.label}
        </span>
      ) : (
        <span className="w-5 h-5 rounded-md bg-gray-100 border border-gray-200 border-dashed" />
      )}
    </button>
  );
}

export default function StaffAttendancePage() {
  const queryClient = useQueryClient();
  const [selectedArea, setSelectedArea] = useState<AreaKey>('som');
  const [sortBy, setSortBy] = useState<'name' | 'group' | 'percentage'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string | null>(null);
  const [mobileSearch, setMobileSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load staff data for the selected area
  const { data, isLoading, error } = useQuery<StaffAreaResponse>({
    queryKey: ['staff-by-area', selectedArea],
    queryFn: async () => {
      const res = await fetch(`/api/admin/attendance/staff-by-area?area=${selectedArea}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load');
      }
      return res.json();
    },
    // Always refetch on mount — if the user cancels or un-cancels a session
    // on /admin/sessions, we want the staff attendance view to pick up the
    // change the next time they come here without waiting for the default
    // staleTime to expire.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const sessions = data?.sessions ?? [];
  const participants = data?.participants ?? [];
  const events = data?.events ?? [];

  // Toggle attendance. Two modes:
  //  - desktop grid: pass currentStatus, server cycles P → L → E → clear
  //  - mobile view: pass an explicit nextStatus (set directly)
  const toggleMutation = useMutation({
    mutationFn: async ({
      sessionId,
      participantId,
      currentStatus,
      nextStatus,
    }: {
      sessionId: string;
      participantId: string;
      currentStatus?: Status | null;
      nextStatus?: Status | null;
    }) => {
      const res = await fetch('/api/admin/attendance/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, participantId, currentStatus, nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to toggle');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-by-area', selectedArea] });
    },
    onError: (err) => {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Toggle failed'}`);
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ['staff-by-area', selectedArea] });
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
  });

  // Desktop grid: cycle from current
  const handleToggle = useCallback(
    (sessionId: string, participantId: string, currentStatus: Status | null) => {
      toggleMutation.mutate({ sessionId, participantId, currentStatus });
    },
    [toggleMutation]
  );

  // Mobile view: set a status directly. If the user clicks a button that's
  // already active, clear the cell.
  const handleSetStatus = useCallback(
    (sessionId: string, participantId: string, current: Status | null, target: Status) => {
      const next = current === target ? null : target;
      toggleMutation.mutate({ sessionId, participantId, nextStatus: next });
    },
    [toggleMutation]
  );

  // Merge sessions by date → grid columns. Multiple sub-group sessions on
  // the same date collapse into one column; each member will see only the
  // session belonging to their own group.
  const dateColumns = useMemo<DateColumn[]>(() => {
    const byDate = new Map<string, DateColumn>();
    for (const s of sessions) {
      const existing = byDate.get(s.date);
      if (existing) {
        existing.sessionsByGroup[s.groupId] = {
          id: s.id,
          isCancelled: s.isCancelled,
          isLocked: s.isLocked,
          hasAttendance: s.hasAttendance,
        };
      } else {
        byDate.set(s.date, {
          date: s.date,
          isFuture: s.isFuture,
          sessionsByGroup: {
            [s.groupId]: {
              id: s.id,
              isCancelled: s.isCancelled,
              isLocked: s.isLocked,
              hasAttendance: s.hasAttendance,
            },
          },
        });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions]);

  // Sorting
  const sortedParticipants = useMemo(() => {
    const list = [...participants];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
          a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'group') {
        const ag = a.primaryGroupName ?? '\uFFFF';
        const bg = b.primaryGroupName ?? '\uFFFF';
        cmp = ag.localeCompare(bg, undefined, { numeric: true, sensitivity: 'base' }) ||
          a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
      } else {
        cmp = a.stats.percentage - b.stats.percentage;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [participants, sortBy, sortAsc]);

  // Find the session a member has on a given date (or null). Looks at each
  // of the member's groupIds and picks the first matching sub-group session
  // for that date.
  function getMemberSessionForDate(
    member: StaffParticipant,
    col: DateColumn
  ): { id: string; isCancelled: boolean; isLocked: boolean } | null {
    for (const groupId of member.groupIds) {
      const s = col.sessionsByGroup[groupId];
      if (s) return s;
    }
    return null;
  }

  // Columns by month for the sticky header
  const columnsByMonth = useMemo(() => {
    const out: { month: string; columns: DateColumn[] }[] = [];
    let current = '';
    for (const col of dateColumns) {
      const m = getMonthLabel(col.date);
      if (m !== current) {
        out.push({ month: m, columns: [col] });
        current = m;
      } else {
        out[out.length - 1].columns.push(col);
      }
    }
    return out;
  }, [dateColumns]);

  const firstInMonth = useMemo(() => {
    const set = new Set<number>();
    for (const mg of columnsByMonth) {
      const idx = dateColumns.indexOf(mg.columns[0]);
      if (idx >= 0) set.add(idx);
    }
    return set;
  }, [columnsByMonth, dateColumns]);

  // Per-column totals
  const dateTotals = useMemo(() => {
    const totals: Record<string, { present: number; total: number; pct: number }> = {};
    for (const col of dateColumns) {
      if (col.isFuture) continue;
      // Only count sessions that have any attendance taken at all
      const anyTaken = Object.values(col.sessionsByGroup).some((s) => s.hasAttendance);
      if (!anyTaken) continue;

      let present = 0;
      let total = 0;
      for (const p of participants) {
        const s = getMemberSessionForDate(p, col);
        if (!s) continue;
        if (s.isCancelled) continue;
        total += 1;
        const status = p.records[s.id];
        if (status === 'present' || status === 'late') present += 1;
      }
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      totals[col.date] = { present, total, pct };
    }
    return totals;
  }, [dateColumns, participants]);

  const avgPercentage = participants.length > 0
    ? Math.round(participants.reduce((s, p) => s + p.stats.percentage, 0) / participants.length)
    : 0;

  function toggleSort(field: 'name' | 'group' | 'percentage') {
    if (sortBy === field) setSortAsc(!sortAsc);
    else {
      setSortBy(field);
      setSortAsc(field !== 'percentage');
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('area', selectedArea);
      formData.append('role', 'staff');
      const res = await fetch('/api/admin/attendance/import', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        const hint =
          body?.firstHeaderRowValues || body?.secondHeaderRowValues
            ? ` Row 0: [${(body.firstHeaderRowValues ?? []).join(', ')}]. Row 1: [${(body.secondHeaderRowValues ?? []).join(', ')}].`
            : '';
        throw new Error((body?.error || 'Import failed') + hint);
      }
      const skippedMsg = body.skipped?.length
        ? ` Skipped: ${body.skipped.slice(0, 10).join(', ')}${body.skipped.length > 10 ? '…' : ''}.`
        : '';
      setImportResult(
        `Imported ${body.imported} records from ${body.dateColumns} date columns (header row ${body.headerRow}, profiles loaded ${body.profilesLoaded}).${skippedMsg}`
      );
      queryClient.invalidateQueries({ queryKey: ['staff-by-area', selectedArea] });
    } catch (err) {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Import failed'}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const CELL_W = 32;
  const NAME_W = 180;
  const GROUP_W = 140;
  const PCT_W = 56;
  const STICKY_LEFT_GROUP = NAME_W;
  const STICKY_LEFT_PCT = NAME_W + GROUP_W;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Staff Attendance</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Take attendance for madrichim and mazkirut. Click any cell to cycle: P → L → E → clear. Empty = absent.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import XLSX
          </Button>
        </div>
      </div>

      {importResult && (
        <div className={cn(
          'rounded-lg px-4 py-3 text-sm whitespace-pre-wrap',
          importResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        )}>
          {importResult}
        </div>
      )}

      {/* Area tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-100 w-fit">
        <Filter className="ml-2 h-4 w-4 text-brand-muted" />
        {AREA_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedArea(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              selectedArea === tab.key
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-dark-text hover:bg-gray-50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-5 w-5 text-brand-navy" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{participants.length}</p>
                <p className="text-xs text-brand-muted">Staff members</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{dateColumns.length}</p>
                <p className="text-xs text-brand-muted">Session dates</p>
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

      {!isLoading && !error && participants.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">No staff in this area</p>
            <p className="text-xs text-brand-muted mt-1">
              Make sure madrichim and mazkirut are assigned to this area&apos;s groups in Users.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Mobile view (small screens only) */}
      {!isLoading && !error && participants.length > 0 && dateColumns.length > 0 && (
        <div className="lg:hidden space-y-3">
          {!mobileSelectedDate ? (
            <Card>
              <CardContent className="py-4 px-3 space-y-2">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider px-2">
                  Pick a session
                </h3>
                {(() => {
                  const past: DateColumn[] = [];
                  const upcoming: DateColumn[] = [];
                  for (const dc of dateColumns) {
                    if (dc.isFuture) upcoming.push(dc);
                    else past.push(dc);
                  }
                  // Past first (most recent), then upcoming
                  past.reverse();
                  return (
                    <>
                      {past.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider mt-3 mb-1 px-2">
                            Past
                          </p>
                          {past.map((dc) => {
                            const d = new Date(dc.date + 'T12:00:00');
                            const stats = dateTotals[dc.date];
                            return (
                              <button
                                key={dc.date}
                                onClick={() => {
                                  setMobileSelectedDate(dc.date);
                                  setMobileSearch('');
                                }}
                                className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3 text-left hover:border-brand-navy/30 hover:shadow-sm transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="text-center w-12 flex-shrink-0 rounded-lg py-1 bg-gray-100">
                                    <p className="text-[10px] uppercase font-medium text-gray-500">
                                      {d.toLocaleDateString('en-US', { month: 'short' })}
                                    </p>
                                    <p className="text-lg font-bold text-gray-600">
                                      {d.getDate()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-brand-dark-text">
                                      {d.toLocaleDateString('en-US', { weekday: 'long' })}
                                    </p>
                                    {stats && (
                                      <p className="text-xs text-brand-muted">
                                        {stats.present}/{stats.total} present
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-brand-muted" />
                              </button>
                            );
                          })}
                        </>
                      )}
                      {upcoming.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-wider mt-3 mb-1 px-2">
                            Upcoming
                          </p>
                          {upcoming.map((dc) => {
                            const d = new Date(dc.date + 'T12:00:00');
                            return (
                              <button
                                key={dc.date}
                                onClick={() => {
                                  setMobileSelectedDate(dc.date);
                                  setMobileSearch('');
                                }}
                                className="w-full flex items-center justify-between rounded-lg border border-brand-navy/20 bg-white px-3 py-3 text-left shadow-sm hover:border-brand-navy/40 hover:shadow-md transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="text-center w-12 flex-shrink-0 rounded-lg py-1 bg-brand-navy text-white">
                                    <p className="text-[10px] uppercase font-medium text-white/70">
                                      {d.toLocaleDateString('en-US', { month: 'short' })}
                                    </p>
                                    <p className="text-lg font-bold">{d.getDate()}</p>
                                  </div>
                                  <p className="text-sm font-semibold text-brand-dark-text">
                                    {d.toLocaleDateString('en-US', { weekday: 'long' })}
                                  </p>
                                </div>
                                <ChevronRight className="h-5 w-5 text-brand-muted" />
                              </button>
                            );
                          })}
                        </>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ) : (
            (() => {
              const col = dateColumns.find((c) => c.date === mobileSelectedDate);
              if (!col) {
                setMobileSelectedDate(null);
                return null;
              }
              const d = new Date(col.date + 'T12:00:00');
              const visibleMembers = sortedParticipants
                .filter((p) => getMemberSessionForDate(p, col) !== null)
                .filter((p) => {
                  if (!mobileSearch) return true;
                  const q = mobileSearch.toLowerCase();
                  return (
                    p.firstName.toLowerCase().includes(q) ||
                    p.lastName.toLowerCase().includes(q)
                  );
                });
              return (
                <Card>
                  <CardContent className="py-4 px-3 space-y-3">
                    <button
                      onClick={() => setMobileSelectedDate(null)}
                      className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back to dates
                    </button>

                    <div className="rounded-xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-4 text-white">
                      <p className="text-xs text-white/70 uppercase tracking-wider">
                        {AREA_TABS.find((t) => t.key === selectedArea)?.label}
                      </p>
                      <p className="text-lg font-bold">
                        {d.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-white/70 mt-1">
                        {visibleMembers.length} staff member{visibleMembers.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                      <input
                        type="text"
                        placeholder="Search staff..."
                        value={mobileSearch}
                        onChange={(e) => setMobileSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                      />
                    </div>

                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      {visibleMembers.length === 0 ? (
                        <p className="py-6 text-center text-sm text-brand-muted">
                          No staff have a session on this date.
                        </p>
                      ) : (
                        visibleMembers.map((p) => {
                          const session = getMemberSessionForDate(p, col)!;
                          const current = (p.records[session.id] as Status | undefined) ?? null;
                          if (session.isCancelled) {
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between py-3 px-3 opacity-60"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-brand-dark-text truncate">
                                    {p.firstName} {p.lastName}
                                  </p>
                                  <p className="text-xs text-brand-muted truncate">
                                    {p.primaryGroupName ?? '—'}
                                  </p>
                                </div>
                                <span className="text-xs text-red-500 font-medium">CANCELLED</span>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={p.id}
                              className="flex items-center justify-between py-3 px-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-brand-dark-text truncate">
                                  {p.firstName} {p.lastName}
                                </p>
                                <p className="text-xs text-brand-muted truncate">
                                  {p.primaryGroupName ?? '—'}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {(['present', 'late', 'excused'] as Status[]).map((s) => {
                                  const isOn = current === s;
                                  const cfg = STATUS_COLORS[s];
                                  return (
                                    <button
                                      key={s}
                                      onClick={() =>
                                        handleSetStatus(session.id, p.id, current, s)
                                      }
                                      className={cn(
                                        'w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold transition-all',
                                        isOn
                                          ? `${cfg.bg} text-white shadow`
                                          : 'bg-gray-100 text-brand-muted hover:bg-gray-200'
                                      )}
                                      title={s}
                                    >
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()
          )}
        </div>
      )}

      {/* Grid (desktop only) */}
      {!isLoading && !error && participants.length > 0 && dateColumns.length > 0 && (
        <Card className="hidden lg:block">
          <CardContent className="py-4 px-0">
            <div className="overflow-auto max-h-[calc(100vh-280px)]">
              <table className="text-xs border-collapse" style={{ minWidth: `${NAME_W + GROUP_W + PCT_W + dateColumns.length * CELL_W}px` }}>
                <thead className="sticky top-0 z-30 bg-white">
                  {/* Month row */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: GROUP_W, left: STICKY_LEFT_GROUP }} className="sticky z-40 bg-white" />
                    <th style={{ minWidth: PCT_W, left: STICKY_LEFT_PCT }} className="sticky z-40 bg-white" />
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
                  {/* Day abbr row */}
                  <tr>
                    <th style={{ minWidth: NAME_W }} className="sticky left-0 z-40 bg-white" />
                    <th style={{ minWidth: GROUP_W, left: STICKY_LEFT_GROUP }} className="sticky z-40 bg-white" />
                    <th style={{ minWidth: PCT_W, left: STICKY_LEFT_PCT }} className="sticky z-40 bg-white" />
                    {dateColumns.map((col) => (
                      <th key={col.date + '-day'} style={{ width: CELL_W }} className="text-center pb-0.5">
                        <span className={cn('text-[9px] font-bold', getDayColor(col.date))}>
                          {getDayAbbr(col.date)}
                        </span>
                      </th>
                    ))}
                  </tr>
                  {/* Date number + cancel row */}
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
                      style={{ minWidth: GROUP_W, left: STICKY_LEFT_GROUP }}
                      className="sticky z-40 bg-white pb-2 pl-2 pr-2 text-left font-semibold text-brand-dark-text text-xs cursor-pointer hover:text-brand-navy select-none border-l border-gray-100"
                      onClick={() => toggleSort('group')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Group
                        {sortBy === 'group' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    <th
                      style={{ minWidth: PCT_W, left: STICKY_LEFT_PCT }}
                      className="sticky z-40 bg-white pb-2 px-1 text-center font-semibold text-brand-dark-text text-xs cursor-pointer hover:text-brand-navy select-none border-r-2 border-gray-200"
                      onClick={() => toggleSort('percentage')}
                    >
                      <span className="inline-flex items-center gap-1">
                        %
                        {sortBy === 'percentage' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    {dateColumns.map((col) => {
                      // For the header action, cancel/restore the FIRST session on this date
                      // (the user can still manage per-group cancel from /admin/sessions)
                      const firstSession = Object.values(col.sessionsByGroup)[0];
                      const allCancelled = Object.values(col.sessionsByGroup).every((s) => s.isCancelled);
                      return (
                        <th
                          key={col.date}
                          style={{ width: CELL_W }}
                          className="pb-2 text-center"
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={cn(
                              'font-medium text-[10px]',
                              col.isFuture ? 'text-blue-400' : 'text-brand-muted'
                            )}>
                              {getDayNum(col.date)}
                            </span>
                            <button
                              onClick={() =>
                                firstSession &&
                                sessionMutation.mutate({
                                  sessionId: firstSession.id,
                                  isCancelled: !firstSession.isCancelled,
                                })
                              }
                              className={cn(
                                'w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors',
                                allCancelled
                                  ? 'text-red-400 hover:text-emerald-500 hover:bg-emerald-50'
                                  : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                              )}
                              title={allCancelled ? 'Restore first session' : 'Cancel first session'}
                            >
                              {allCancelled ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedParticipants.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td style={{ minWidth: NAME_W }} className="sticky left-0 z-10 bg-white py-1 pl-4 pr-2 whitespace-nowrap">
                        <span className="font-medium text-xs text-brand-dark-text truncate">
                          {p.lastName}, {p.firstName}
                        </span>
                      </td>
                      <td style={{ minWidth: GROUP_W, left: STICKY_LEFT_GROUP }} className="sticky z-10 bg-white py-1 pl-2 pr-2 whitespace-nowrap border-l border-gray-100">
                        <span className="text-[11px] text-brand-muted truncate">
                          {p.primaryGroupName ?? '—'}
                        </span>
                      </td>
                      <td style={{ minWidth: PCT_W, left: STICKY_LEFT_PCT }} className="sticky z-10 bg-white py-1 px-1 text-center border-r-2 border-gray-200">
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[10px] font-bold',
                          getPercentageColor(p.stats.percentage),
                          getPercentageBg(p.stats.percentage)
                        )}>
                          {p.stats.percentage}%
                        </span>
                      </td>
                      {dateColumns.map((col, colIdx) => {
                        const session = getMemberSessionForDate(p, col);
                        if (!session) {
                          return (
                            <td
                              key={col.date}
                              style={{ width: CELL_W }}
                              className={cn(
                                'py-1 text-center bg-gray-50/60',
                                firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15'
                              )}
                            >
                              <span className="text-gray-300 text-[10px]">—</span>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.date}
                            style={{ width: CELL_W }}
                            className={cn(
                              'py-1 text-center',
                              firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15',
                              session.isCancelled && 'bg-red-50/30'
                            )}
                          >
                            {session.isCancelled ? (
                              <span className="text-red-300" title="Session cancelled">—</span>
                            ) : (
                              // No future-gate and no lock-gate for staff.
                              // Staff attendance is always editable so the
                              // coordinator can enter historical data or
                              // correct past marks at any time.
                              <StatusCell
                                status={(p.records[session.id] as Status | undefined) ?? null}
                                sessionId={session.id}
                                participantId={p.id}
                                onToggle={handleToggle}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td style={{ minWidth: NAME_W }} className="sticky left-0 z-10 bg-gray-50 py-2 pl-4 pr-2 whitespace-nowrap">
                      <span className="font-bold text-xs text-brand-navy uppercase tracking-wider">Totals</span>
                    </td>
                    <td style={{ minWidth: GROUP_W, left: STICKY_LEFT_GROUP }} className="sticky z-10 bg-gray-50 py-2 pl-2 pr-2 whitespace-nowrap border-l border-gray-100" />
                    <td style={{ minWidth: PCT_W, left: STICKY_LEFT_PCT }} className="sticky z-10 bg-gray-50 py-2 px-1 text-center border-r-2 border-gray-200" />
                    {dateColumns.map((col, colIdx) => {
                      const stats = dateTotals[col.date];
                      if (!stats) {
                        return (
                          <td key={col.date + '-total'} style={{ width: CELL_W }} className={cn(
                            'py-2 text-center',
                            firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15'
                          )} />
                        );
                      }
                      return (
                        <td
                          key={col.date + '-total'}
                          style={{ width: CELL_W }}
                          className={cn(
                            'py-1 text-center',
                            firstInMonth.has(colIdx) && 'border-l-2 border-brand-navy/15'
                          )}
                          title={`${stats.present}/${stats.total} (${stats.pct}%)`}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[9px] font-bold text-brand-dark-text">{stats.present}</span>
                            <span className={cn('text-[8px] font-semibold', getPercentageColor(stats.pct))}>
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

            <div className="mt-4 pt-3 mx-4 border-t border-gray-100 flex items-center gap-4 text-xs text-brand-muted flex-wrap">
              {(Object.entries(STATUS_COLORS) as [Status, { bg: string; label: string }][]).map(([key, val]) => (
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
                <span className="w-4 h-4 rounded-md bg-gray-50 flex items-center justify-center text-gray-300 text-[10px]">—</span>
                No session for this member
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-md bg-red-50 flex items-center justify-center text-red-300 text-[10px]">—</span>
                Cancelled
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Special events grid */}
      {!isLoading && !error && participants.length > 0 && events.length > 0 && (
        <Card>
          <CardContent className="py-4 px-0">
            <div className="px-4 pb-2">
              <h3 className="text-sm font-bold text-brand-navy uppercase tracking-wider">
                Special Events
              </h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Staff assigned to the event&apos;s groups count as attending by
                default. Toggle from /admin/events if needed.
              </p>
            </div>
            <div className="overflow-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="pb-2 pl-4 pr-2 text-left font-semibold text-brand-dark-text text-xs">
                      Name
                    </th>
                    <th className="pb-2 pl-2 pr-2 text-left font-semibold text-brand-dark-text text-xs">
                      Group
                    </th>
                    {events.map((ev) => (
                      <th
                        key={ev.id}
                        className="pb-2 px-2 text-center font-semibold text-purple-700 text-xs"
                        title={`${ev.name} (${ev.hours}h)`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="truncate max-w-[100px]">{ev.name}</span>
                          <span className="text-[9px] text-purple-500">
                            {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            · {ev.hours}h
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParticipants.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="py-1.5 pl-4 pr-2 whitespace-nowrap">
                        <span className="font-medium text-xs text-brand-dark-text truncate">
                          {p.lastName}, {p.firstName}
                        </span>
                      </td>
                      <td className="py-1.5 pl-2 pr-2 whitespace-nowrap">
                        <span className="text-[11px] text-brand-muted truncate">
                          {p.primaryGroupName ?? '—'}
                        </span>
                      </td>
                      {events.map((ev) => {
                        const attended = p.eventRecords?.[ev.id] ?? false;
                        return (
                          <td key={ev.id} className="py-1.5 px-2 text-center">
                            <span
                              className={cn(
                                'inline-flex w-5 h-5 rounded-md items-center justify-center text-[10px] font-bold',
                                attended
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-gray-100 border border-gray-200 border-dashed'
                              )}
                              title={attended ? 'Attending' : 'Not attending'}
                            >
                              {attended ? '✓' : ''}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
