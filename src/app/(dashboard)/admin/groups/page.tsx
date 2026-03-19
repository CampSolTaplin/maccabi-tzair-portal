'use client';

import { useState, useMemo, useCallback } from 'react';
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
  AlertTriangle,
  Download,
  Printer,
  Phone,
  Info,
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
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  familyName: string | null;
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

/* ─── CSV Export Helper ─── */

function escapeCsvField(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvContent(groups: GroupWithMembers[], members: GroupMember[], includeGroupColumn: boolean): string {
  const headers = [
    ...(includeGroupColumn ? ['Group'] : []),
    'First Name',
    'Last Name',
    'Grade',
    'School',
    'Allergies',
    'Parent Name',
    'Parent Email',
    'Parent Phone',
    'Emergency Contact',
    'Emergency Phone',
  ];

  const rows = members.map((m) => {
    const group = includeGroupColumn
      ? groups.find((g) => g.members.some((gm) => gm.id === m.id))
      : null;
    return [
      ...(includeGroupColumn ? [escapeCsvField(group?.name)] : []),
      escapeCsvField(m.firstName),
      escapeCsvField(m.lastName),
      escapeCsvField(m.grade),
      escapeCsvField(m.school),
      escapeCsvField(m.allergies),
      escapeCsvField(m.parentName),
      escapeCsvField(m.parentEmail),
      escapeCsvField(m.parentPhone),
      escapeCsvField(m.emergencyContactName),
      escapeCsvField(m.emergencyContactPhone),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Emergency Contact Tooltip ─── */

function EmergencyTooltip({ member }: { member: GroupMember }) {
  const [open, setOpen] = useState(false);
  const hasEmergency = member.emergencyContactName || member.emergencyContactPhone;
  if (!hasEmergency) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-brand-muted hover:text-brand-navy hover:bg-brand-navy/10 transition-colors cursor-pointer"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        aria-label="Emergency contact info"
      >
        <Phone className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-lg bg-gray-900 text-white text-xs p-3 shadow-lg pointer-events-none">
          <span className="block font-semibold mb-1">Emergency Contact</span>
          {member.emergencyContactName && (
            <span className="block">{member.emergencyContactName}</span>
          )}
          {member.emergencyContactPhone && (
            <span className="block">{member.emergencyContactPhone}</span>
          )}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
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

  // Check if anyone in the group has allergies
  const hasAnyAllergies = useMemo(
    () => filteredMembers.some((m) => m.allergies),
    [filteredMembers]
  );

  // Hide card entirely if searching and no matches
  if (searchQuery.trim() && filteredMembers.length === 0) return null;

  function handleGroupExport(e: React.MouseEvent) {
    e.stopPropagation();
    const csv = buildCsvContent([group], filteredMembers, false);
    downloadCsv(csv, `${group.name.replace(/[^a-zA-Z0-9]/g, '_')}_roster.csv`);
  }

  return (
    <Card
      className={cn(
        'border-l-4 transition-shadow hover:shadow-md print:shadow-none print:break-inside-avoid',
        getAreaBorderColor(group.area)
      )}
    >
      <CardHeader
        className="cursor-pointer select-none py-2.5 print:cursor-default"
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
            {/* Per-group CSV export */}
            <button
              type="button"
              onClick={handleGroupExport}
              className="hidden sm:inline-flex items-center justify-center h-7 w-7 rounded-md text-brand-muted hover:text-brand-navy hover:bg-brand-navy/10 transition-colors cursor-pointer print:hidden"
              title={`Export ${group.name} as CSV`}
              aria-label={`Export ${group.name} as CSV`}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <Badge className="bg-brand-navy/10 text-brand-navy font-semibold text-sm px-3">
              {displayCount}
            </Badge>
            <span className="print:hidden">
              {expanded ? (
                <ChevronUp className="h-5 w-5 text-brand-muted" />
              ) : (
                <ChevronDown className="h-5 w-5 text-brand-muted" />
              )}
            </span>
          </div>
        </div>
      </CardHeader>

      {/* Always show content in print mode; otherwise respect expanded state */}
      <CardContent className={cn('pt-0', !expanded && 'hidden print:block')}>
        {filteredMembers.length === 0 ? (
          <p className="text-sm text-brand-muted py-4 text-center">
            No members found.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    Name
                  </th>
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    Grade
                  </th>
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    School
                  </th>
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    Parent/Family
                  </th>
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    Parent Email
                  </th>
                  <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                    Parent Phone
                  </th>
                  {hasAnyAllergies && (
                    <th className="pb-1.5 pr-3 text-left font-medium text-brand-muted text-xs">
                      Allergies
                    </th>
                  )}
                  <th className="pb-1.5 text-left font-medium text-brand-muted text-xs w-8">
                    <span className="sr-only">Emergency</span>
                    <Info className="h-3 w-3 inline" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-1.5 pr-3 font-medium text-brand-dark-text whitespace-nowrap">
                      {member.firstName} {member.lastName}
                    </td>
                    <td className="py-1.5 pr-3 text-brand-muted whitespace-nowrap">
                      {member.grade ?? '-'}
                    </td>
                    <td className="py-1.5 pr-3 text-brand-muted whitespace-nowrap">
                      {member.school ?? '-'}
                    </td>
                    <td className="py-1.5 pr-3 text-brand-muted whitespace-nowrap">
                      {member.parentName || member.familyName || '-'}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {member.parentEmail ? (
                        <a
                          href={`mailto:${member.parentEmail}`}
                          className="text-brand-navy hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {member.parentEmail}
                        </a>
                      ) : (
                        <span className="text-brand-muted">-</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {member.parentPhone ? (
                        <a
                          href={`tel:${member.parentPhone}`}
                          className="text-brand-navy hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {member.parentPhone}
                        </a>
                      ) : (
                        <span className="text-brand-muted">-</span>
                      )}
                    </td>
                    {hasAnyAllergies && (
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {member.allergies ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium">
                            {member.allergies}
                          </span>
                        ) : null}
                      </td>
                    )}
                    <td className="py-1.5 whitespace-nowrap">
                      <EmergencyTooltip member={member} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
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

  // Get all visible members (respecting search + area filter) for CSV export
  const visibleMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return filteredGroups.flatMap((g) => {
      if (!q) return g.members;
      return g.members.filter(
        (m) =>
          m.firstName.toLowerCase().includes(q) ||
          m.lastName.toLowerCase().includes(q) ||
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
      );
    });
  }, [filteredGroups, searchQuery]);

  // Calculate totals
  const totalParticipants = useMemo(
    () => groups.reduce((sum, g) => sum + g.memberCount, 0),
    [groups]
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

  const handleExportCsv = useCallback(() => {
    const csv = buildCsvContent(filteredGroups, visibleMembers, true);
    const filterLabel = areaFilter === 'all' ? 'all_groups' : areaFilter;
    downloadCsv(csv, `maccabi_tzair_${filterLabel}_roster.csv`);
  }, [filteredGroups, visibleMembers, areaFilter]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          /* Hide non-content elements */
          nav, aside, header, footer,
          [data-print-hide] {
            display: none !important;
          }
          /* Print header */
          [data-print-header] {
            display: block !important;
          }
          /* Show all card content */
          body {
            font-size: 10pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Page breaks between groups */
          .print\\:break-before-page {
            break-before: page;
          }
          /* Compact layout */
          table {
            font-size: 9pt;
          }
          td, th {
            padding: 2px 6px !important;
          }
        }
      `}</style>

      <div className="space-y-6">
        {/* Print Header - hidden on screen */}
        <div data-print-header className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold">Maccabi Tzair - Group Roster</h1>
          <p className="text-sm text-gray-500 mt-1">
            Printed on {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Page Header */}
        <div data-print-hide>
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
          <div data-print-hide className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-brand-navy to-brand-navy/80 px-5 py-3 text-white shadow-sm">
            <Users className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              {totalParticipants.toLocaleString()} participants across{' '}
              {groups.length} groups
            </span>
          </div>
        )}

        {/* Controls */}
        <div data-print-hide className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="flex items-center gap-2">
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

            {/* Export CSV */}
            {!isLoading && !error && groups.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="whitespace-nowrap"
                title="Export visible groups as CSV"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Export CSV</span>
              </Button>
            )}

            {/* Print */}
            {!isLoading && !error && groups.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="whitespace-nowrap"
                title="Print current view"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Print</span>
              </Button>
            )}

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
                  <span className="hidden sm:inline ml-1">Collapse All</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Expand All</span>
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
    </>
  );
}
