'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/* ─── Types ─── */

interface GroupMember {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  school: string | null;
  allergies: string | null;
  salesforceContactId: string | null;
}

interface GroupWithMembers {
  id: string;
  name: string;
  slug: string;
  area: string;
  description: string;
  memberCount: number;
  members: GroupMember[];
}

/* ─── Area Helpers ─── */

const AREA_TABS = [
  { key: 'all', label: 'All' },
  { key: 'katan', label: 'Katan' },
  { key: 'noar', label: 'Noar' },
  { key: 'leadership', label: 'Leadership' },
] as const;

type AreaFilter = (typeof AREA_TABS)[number]['key'];

function getAreaBorderColor(area: string): string {
  switch (area) {
    case 'katan':
      return 'border-l-blue-500';
    case 'noar':
      return 'border-l-purple-500';
    case 'leadership':
      return 'border-l-amber-500';
    default:
      return 'border-l-gray-400';
  }
}

function getAreaBadgeClasses(area: string): string {
  switch (area) {
    case 'katan':
      return 'bg-blue-50 text-blue-700';
    case 'noar':
      return 'bg-purple-50 text-purple-700';
    case 'leadership':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/* ─── Skeleton ─── */

function GroupCardSkeleton() {
  return (
    <Card className="border-l-4 border-l-gray-200 animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
          <div className="h-7 w-10 rounded-full bg-gray-200" />
        </div>
      </CardHeader>
    </Card>
  );
}

/* ─── Group Card ─── */

function GroupCard({
  group,
  expanded,
  onToggle,
  searchQuery,
}: {
  group: GroupWithMembers;
  expanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}) {
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return group.members;
    const q = searchQuery.toLowerCase();
    return group.members.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
    );
  }, [group.members, searchQuery]);

  const displayCount = searchQuery.trim()
    ? filteredMembers.length
    : group.memberCount;

  // Hide card entirely if searching and no matches
  if (searchQuery.trim() && filteredMembers.length === 0) return null;

  return (
    <Card
      className={cn(
        'border-l-4 transition-shadow hover:shadow-md',
        getAreaBorderColor(group.area)
      )}
    >
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-brand-dark-text">
                  {group.name}
                </h3>
                <Badge className={getAreaBadgeClasses(group.area)}>
                  {group.area}
                </Badge>
              </div>
              {group.description && (
                <p className="mt-0.5 text-sm text-brand-muted truncate">
                  {group.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className="bg-brand-navy/10 text-brand-navy font-semibold text-sm px-3">
              {displayCount}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-brand-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-brand-muted" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {filteredMembers.length === 0 ? (
            <p className="text-sm text-brand-muted py-4 text-center">
              No members found.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 pr-4 text-left font-medium text-brand-muted">
                      Name
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium text-brand-muted">
                      Grade
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium text-brand-muted">
                      School
                    </th>
                    <th className="pb-2 text-left font-medium text-brand-muted">
                      Allergies
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-brand-dark-text whitespace-nowrap">
                        {member.firstName} {member.lastName}
                      </td>
                      <td className="py-2 pr-4 text-brand-muted whitespace-nowrap">
                        {member.grade ?? '-'}
                      </td>
                      <td className="py-2 pr-4 text-brand-muted whitespace-nowrap">
                        {member.school ?? '-'}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {member.allergies ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium">
                            {member.allergies}
                          </span>
                        ) : (
                          <span className="text-brand-muted text-xs">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Page ─── */

export default function AdminGroupsPage() {
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useQuery<{ groups: GroupWithMembers[] }>({
    queryKey: ['admin-groups'],
    queryFn: async () => {
      const res = await fetch('/api/admin/groups');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load groups');
      }
      return res.json();
    },
  });

  const groups = data?.groups ?? [];

  // Filter groups by area
  const filteredGroups = useMemo(() => {
    if (areaFilter === 'all') return groups;
    return groups.filter((g) => g.area === areaFilter);
  }, [groups, areaFilter]);

  // Calculate totals
  const totalParticipants = useMemo(
    () => groups.reduce((sum, g) => sum + g.memberCount, 0),
    [groups]
  );

  const visibleGroupIds = useMemo(
    () => new Set(filteredGroups.map((g) => g.id)),
    [filteredGroups]
  );

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setAllExpanded(false);
    } else {
      setExpandedGroups(new Set(filteredGroups.map((g) => g.id)));
      setAllExpanded(true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Groups</h2>
        {!isLoading && !error && (
          <p className="mt-1 text-sm text-brand-muted">
            {totalParticipants.toLocaleString()} participants across{' '}
            {groups.length} groups
          </p>
        )}
      </div>

      {/* Summary Bar */}
      {!isLoading && !error && (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-brand-navy to-brand-navy/80 px-5 py-3 text-white shadow-sm">
          <Users className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            {totalParticipants.toLocaleString()} participants across{' '}
            {groups.length} groups
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Area Filter Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-100">
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

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Search participants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm text-brand-dark-text placeholder:text-brand-muted focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy sm:w-64"
            />
          </div>

          {/* Expand/Collapse All */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            className="whitespace-nowrap"
          >
            {allExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Expand All
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-800">Failed to load groups</p>
              <p className="text-sm text-red-600">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group Cards */}
      {!isLoading && !error && (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              expanded={expandedGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              searchQuery={searchQuery}
            />
          ))}

          {filteredGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-12 shadow-sm">
              <Users className="h-12 w-12 text-brand-muted/40" />
              <p className="mt-3 text-sm font-medium text-brand-muted">
                No groups found for this filter.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
