'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  Filter,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ParticipantStats } from '@/lib/attendance/stats';

interface SessionHeader {
  id: string;
  date: string;
  isLocked: boolean;
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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getPercentageColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getStatusDot(status: string | null): React.ReactNode {
  switch (status) {
    case 'present':
      return <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" title="Present" />;
    case 'late':
      return <span className="inline-block h-3 w-3 rounded-full bg-amber-400" title="Late" />;
    case 'absent':
      return <span className="inline-block h-3 w-3 rounded-full bg-red-400" title="Absent" />;
    case 'excused':
      return <span className="inline-block h-3 w-3 rounded-full bg-gray-300" title="Excused" />;
    default:
      return <span className="inline-block h-3 w-3 rounded-full bg-gray-100" title="No data" />;
  }
}

export default function AdminAttendancePage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'percentage'>('name');
  const [sortAsc, setSortAsc] = useState(true);

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

  // Auto-select first group
  const effectiveGroupId = selectedGroupId ?? groups[0]?.id ?? null;

  // Fetch attendance stats for selected group
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

  // Summary stats
  const avgPercentage = participants.length > 0
    ? Math.round(participants.reduce((s, p) => s + p.stats.percentage, 0) / participants.length)
    : 0;
  const flaggedCount = participants.filter((p) => p.consecutiveAbsences >= 2).length;

  function toggleSort(field: 'name' | 'percentage') {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(field === 'name');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Attendance</h2>
        <p className="mt-1 text-sm text-brand-muted">
          View attendance stats and identify at-risk participants
        </p>
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <p className="text-xs text-brand-muted">Need Follow-up (2+ absences)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* No data */}
      {!isLoading && !error && effectiveGroupId && sessions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-brand-muted/40" />
            <p className="mt-3 text-sm font-medium text-brand-muted">No attendance data yet</p>
            <p className="text-xs text-brand-muted mt-1">
              Generate sessions and take attendance to see stats here
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attendance grid */}
      {!isLoading && !error && sessions.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th
                      className="pb-2 pr-4 text-left font-medium text-brand-muted text-xs cursor-pointer hover:text-brand-dark-text select-none"
                      onClick={() => toggleSort('name')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Name
                        {sortBy === 'name' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    <th
                      className="pb-2 pr-4 text-center font-medium text-brand-muted text-xs cursor-pointer hover:text-brand-dark-text select-none w-16"
                      onClick={() => toggleSort('percentage')}
                    >
                      <span className="inline-flex items-center gap-1">
                        %
                        {sortBy === 'percentage' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </th>
                    {sessions.map((s) => (
                      <th key={s.id} className="pb-2 text-center font-medium text-brand-muted text-[10px] w-8 whitespace-nowrap">
                        {formatShortDate(s.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParticipants.map((p) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b border-gray-50 last:border-0',
                        p.consecutiveAbsences >= 2 && 'bg-red-50/50'
                      )}
                    >
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className="font-medium text-brand-dark-text">
                          {p.firstName} {p.lastName}
                        </span>
                        {p.consecutiveAbsences >= 2 && (
                          <Badge className="ml-2 bg-red-100 text-red-700 text-[10px]">
                            {p.consecutiveAbsences} absent
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <span className={cn('font-semibold text-xs', getPercentageColor(p.stats.percentage))}>
                          {p.stats.percentage}%
                        </span>
                      </td>
                      {sessions.map((s) => (
                        <td key={s.id} className="py-2 text-center">
                          {getStatusDot(p.records[s.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-brand-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-400" /> Late
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-400" /> Absent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-gray-300" /> Excused
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
