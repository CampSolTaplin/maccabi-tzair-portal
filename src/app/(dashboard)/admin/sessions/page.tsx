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

const AREA_TABS = [
  { key: 'all', label: 'All Groups' },
  { key: 'katan', label: 'Katan' },
  { key: 'noar', label: 'Noar' },
  { key: 'leadership', label: 'Leadership' },
] as const;

type AreaFilter = (typeof AREA_TABS)[number]['key'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getGroupColor(area: string): string {
  switch (area) {
    case 'katan': return 'bg-blue-50 text-blue-700';
    case 'noar': return 'bg-purple-50 text-purple-700';
    case 'leadership': return 'bg-amber-50 text-amber-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default function AdminSessionsPage() {
  const queryClient = useQueryClient();
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ['admin-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const sessions = data?.sessions ?? [];

  const toggleMutation = useMutation({
    mutationFn: async ({ sessionId, field, value }: { sessionId: string; field: string; value: boolean }) => {
      const res = await fetch('/api/admin/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to update session');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
  });

  const filteredSessions = useMemo(() => {
    if (areaFilter === 'all') return sessions;
    return sessions.filter((s) => s.groupArea === areaFilter);
  }, [sessions, areaFilter]);

  // Group sessions by month
  const sessionsByMonth = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of filteredSessions) {
      const d = new Date(s.sessionDate + 'T12:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(s);
    }
    return map;
  }, [filteredSessions]);

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

  const totalActive = sessions.filter((s) => !s.isCancelled).length;
  const totalCancelled = sessions.filter((s) => s.isCancelled).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Sessions</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Manage session calendar. Cancel sessions for holidays or special dates.
        </p>
      </div>

      {/* Summary + Generate */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Card className="flex-1">
          <CardContent className="flex items-center gap-3 py-4">
            <Calendar className="h-5 w-5 text-brand-navy" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{totalActive}</p>
              <p className="text-xs text-brand-muted">Active sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="flex items-center gap-3 py-4">
            <Ban className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{totalCancelled}</p>
              <p className="text-xs text-brand-muted">Cancelled</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="flex items-center gap-3 py-4">
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating...' : 'Generate Season'}
            </Button>
          </CardContent>
        </Card>
      </div>

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

      {/* Sessions by month */}
      {!isLoading && !error && Array.from(sessionsByMonth.entries()).map(([month, monthSessions]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">{month}</h3>
          <div className="space-y-2">
            {monthSessions.map((session) => (
              <Card
                key={session.id}
                className={cn(
                  'transition-opacity',
                  session.isCancelled && 'opacity-50'
                )}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-center w-14 flex-shrink-0">
                      <p className="text-xs text-brand-muted">
                        {new Date(session.sessionDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </p>
                      <p className="text-lg font-bold text-brand-dark-text">
                        {new Date(session.sessionDate + 'T12:00:00').getDate()}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={getGroupColor(session.groupArea)}>
                          {session.groupName}
                        </Badge>
                        {session.isCancelled && (
                          <Badge className="bg-red-50 text-red-600">Cancelled</Badge>
                        )}
                        {session.isLocked && (
                          <Badge className="bg-gray-100 text-gray-600">
                            <Lock className="h-3 w-3 mr-1" />Locked
                          </Badge>
                        )}
                      </div>
                      {session.attendanceCount > 0 && (
                        <p className="text-xs text-brand-muted mt-0.5 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {session.attendanceCount} marked
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate({
                        sessionId: session.id,
                        field: 'is_cancelled',
                        value: !session.isCancelled,
                      })}
                      className={cn(
                        'p-2 rounded-lg transition-colors cursor-pointer',
                        session.isCancelled
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-red-500 hover:bg-red-50'
                      )}
                      title={session.isCancelled ? 'Restore session' : 'Cancel session'}
                    >
                      {session.isCancelled ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({
                        sessionId: session.id,
                        field: 'is_locked',
                        value: !session.isLocked,
                      })}
                      className={cn(
                        'p-2 rounded-lg transition-colors cursor-pointer',
                        session.isLocked
                          ? 'text-amber-600 hover:bg-amber-50'
                          : 'text-gray-400 hover:bg-gray-50'
                      )}
                      title={session.isLocked ? 'Unlock session' : 'Lock session'}
                    >
                      {session.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
