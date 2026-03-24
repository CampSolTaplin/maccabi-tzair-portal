'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  Upload,
  FileSpreadsheet,
  Users,
  UserPlus,
  UserMinus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ArrowRight,
  Loader2,
  XCircle,
} from 'lucide-react';

/* ─── Types ─── */

interface AnalyticsSummary {
  lastYear: { total: number; year: string };
  thisYear: { total: number; year: string };
  returned: number;
  new: number;
  lost: number;
  retentionRate: number;
  growthRate: number;
}

interface GroupRow {
  slug: string;
  name: string;
  lastYear: number;
  thisYear: number;
  returned: number;
  new: number;
  lost: number;
  retentionPct: number;
  attendancePct: number | null;
}

interface LostParticipant {
  name: string;
  group: string;
  grade: string;
  contactId: string;
}

interface ReturnedParticipant {
  name: string;
  lastYearGroup: string;
  thisYearGroup: string;
  transitioned: boolean;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  byGroup: GroupRow[];
  lostParticipants: LostParticipant[];
  returnedParticipants: ReturnedParticipant[];
}

/* ─── Group Display Map ─── */

const GROUP_ORDER: Record<string, string> = {
  'katan-kinder': 'Kinder',
  'katan-1st': '1st Grade',
  'katan-2nd': '2nd Grade',
  'katan-3rd': '3rd Grade',
  'katan-4th': '4th Grade',
  'katan-5th': '5th Grade',
  'noar-6th': '6th Grade',
  'noar-7th': '7th Grade',
  'noar-8th': '8th Grade',
  'pre-som': 'Pre-SOM',
  'som': 'SOM',
};

/* ─── Helper Components ─── */

function SummaryCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: 'navy' | 'coral' | 'green' | 'red';
}) {
  const colorMap = {
    navy: 'bg-brand-light-blue text-brand-navy',
    coral: 'bg-brand-coral/10 text-brand-coral',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-brand-muted">{label}</p>
            <p className="mt-1 text-3xl font-bold text-brand-dark-text">{value}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-brand-muted">{subtitle}</p>
            )}
          </div>
          <div className={cn('rounded-lg p-2.5', colorMap[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBar({ lastYear, thisYear }: { lastYear: number; thisYear: number }) {
  const delta = thisYear - lastYear;
  const maxAbs = Math.max(Math.abs(delta), 1);
  const width = Math.min(Math.abs(delta) * 8, 60);

  if (delta === 0) {
    return <span className="text-xs text-brand-muted">--</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-3 rounded-full transition-all',
          delta > 0 ? 'bg-emerald-400' : 'bg-red-400'
        )}
        style={{ width: `${width}px` }}
      />
      <span
        className={cn(
          'text-xs font-semibold',
          delta > 0 ? 'text-emerald-700' : 'text-red-700'
        )}
      >
        {delta > 0 ? '+' : ''}
        {delta}
      </span>
    </div>
  );
}

/* ─── Main Page ─── */

export default function AnalyticsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [lostExpanded, setLostExpanded] = useState(false);
  const [transitionExpanded, setTransitionExpanded] = useState(false);
  const [lostSortGroup, setLostSortGroup] = useState<string | null>(null);

  // Upload mutation
  const mutation = useMutation<AnalyticsData, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/analytics', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Analysis failed (${res.status})`);
      }

      return res.json();
    },
  });

  const data = mutation.data;

  /* ─── File Handling ─── */

  const handleFile = useCallback(
    (file: File) => {
      mutation.mutate(file);
    },
    [mutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleReset = useCallback(() => {
    mutation.reset();
    setLostExpanded(false);
    setTransitionExpanded(false);
    setLostSortGroup(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [mutation]);

  /* ─── Derived data ─── */

  const transitioned = data?.returnedParticipants.filter((p) => p.transitioned) ?? [];

  const sortedLost = data
    ? [...data.lostParticipants].sort((a, b) => {
        if (lostSortGroup) {
          if (a.group === lostSortGroup && b.group !== lostSortGroup) return -1;
          if (b.group === lostSortGroup && a.group !== lostSortGroup) return 1;
        }
        return a.group.localeCompare(b.group) || a.name.localeCompare(b.name);
      })
    : [];

  const lostGroupOptions = data
    ? [...new Set(data.lostParticipants.map((p) => p.group))].sort()
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">
          Year-over-Year Analytics
        </h2>
        <p className="mt-1 text-sm text-brand-muted">
          Upload last year&apos;s Salesforce XLSX export to compare enrollment,
          retention, and growth
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-navy" />
            <CardTitle>Upload Last Year&apos;s Roster</CardTitle>
          </div>
          <CardDescription>
            Upload the Salesforce enrollment export (.xlsx) from the previous program
            year
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data && !mutation.isPending ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all',
                dragActive
                  ? 'border-brand-navy bg-brand-light-blue'
                  : 'border-gray-300 bg-gray-50 hover:border-brand-navy/50 hover:bg-brand-light-blue/50'
              )}
            >
              <div className="rounded-full bg-brand-light-blue p-4">
                <Upload className="h-8 w-8 text-brand-navy" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-brand-dark-text">
                  Drag and drop your XLSX file here, or click to browse
                </p>
                <p className="mt-1 text-xs text-brand-muted">
                  Salesforce enrollment export from last year
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : mutation.isPending ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
              <p className="text-sm font-medium text-brand-muted">
                Analyzing enrollment data...
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-dark-text">
                    Analysis complete
                  </p>
                  <p className="text-xs text-brand-muted">
                    Compared {data?.summary.lastYear.total ?? 0} last-year participants
                    with {data?.summary.thisYear.total ?? 0} current
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                Upload New File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {mutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="mt-1 text-sm text-red-700">{mutation.error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              label="Last Year Total"
              value={data.summary.lastYear.total}
              subtitle={data.summary.lastYear.year}
              icon={Users}
              color="navy"
            />
            <SummaryCard
              label="This Year Total"
              value={data.summary.thisYear.total}
              subtitle={data.summary.thisYear.year}
              icon={Users}
              color="coral"
            />
            <SummaryCard
              label="Retention Rate"
              value={`${data.summary.retentionRate}%`}
              subtitle={`${data.summary.returned} returned`}
              icon={RefreshCw}
              color="green"
            />
            <SummaryCard
              label="Growth Rate"
              value={`${data.summary.growthRate > 0 ? '+' : ''}${data.summary.growthRate}%`}
              subtitle={`${data.summary.new} new participants`}
              icon={data.summary.growthRate >= 0 ? TrendingUp : TrendingDown}
              color={data.summary.growthRate >= 0 ? 'green' : 'red'}
            />
          </div>

          {/* Retention Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Retention Overview</CardTitle>
              <CardDescription>
                Breakdown of returned, new, and lost participants
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center rounded-xl bg-emerald-50 p-6">
                  <div className="rounded-full bg-emerald-100 p-3">
                    <RefreshCw className="h-6 w-6 text-emerald-700" />
                  </div>
                  <p className="mt-3 text-3xl font-bold text-emerald-700">
                    {data.summary.returned}
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-600">Returned</p>
                </div>
                <div className="flex flex-col items-center rounded-xl bg-blue-50 p-6">
                  <div className="rounded-full bg-blue-100 p-3">
                    <UserPlus className="h-6 w-6 text-blue-700" />
                  </div>
                  <p className="mt-3 text-3xl font-bold text-blue-700">
                    {data.summary.new}
                  </p>
                  <p className="mt-1 text-sm font-medium text-blue-600">New</p>
                </div>
                <div className="flex flex-col items-center rounded-xl bg-red-50 p-6">
                  <div className="rounded-full bg-red-100 p-3">
                    <UserMinus className="h-6 w-6 text-red-700" />
                  </div>
                  <p className="mt-3 text-3xl font-bold text-red-700">
                    {data.summary.lost}
                  </p>
                  <p className="mt-1 text-sm font-medium text-red-600">Lost</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Growth by Group Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-brand-navy" />
                <CardTitle>Growth by Group</CardTitle>
              </div>
              <CardDescription>
                Year-over-year enrollment comparison per group
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="pb-3 pr-4 font-medium text-brand-muted">Group</th>
                      <th className="pb-3 pr-4 text-center font-medium text-brand-muted">
                        Last Year
                      </th>
                      <th className="pb-3 pr-4 text-center font-medium text-brand-muted">
                        This Year
                      </th>
                      <th className="pb-3 pr-4 font-medium text-brand-muted">Delta</th>
                      <th className="pb-3 pr-4 text-center font-medium text-brand-muted">
                        Retention
                      </th>
                      <th className="pb-3 text-center font-medium text-brand-muted">
                        Attendance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byGroup
                      .filter((g) => g.lastYear > 0 || g.thisYear > 0)
                      .map((g) => (
                        <tr key={g.slug} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-medium text-brand-dark-text">
                            {g.name}
                          </td>
                          <td className="py-3 pr-4 text-center text-brand-muted">
                            {g.lastYear}
                          </td>
                          <td className="py-3 pr-4 text-center font-semibold text-brand-dark-text">
                            {g.thisYear}
                          </td>
                          <td className="py-3 pr-4">
                            <DeltaBar lastYear={g.lastYear} thisYear={g.thisYear} />
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {g.lastYear > 0 ? (
                              <Badge
                                variant={
                                  g.retentionPct >= 70
                                    ? 'success'
                                    : g.retentionPct >= 50
                                      ? 'warning'
                                      : 'danger'
                                }
                              >
                                {g.retentionPct}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-brand-muted">--</span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            {g.attendancePct != null ? (
                              <span className="text-sm text-brand-dark-text">
                                {g.attendancePct}%
                              </span>
                            ) : (
                              <span className="text-xs text-brand-muted">--</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 font-semibold">
                      <td className="pt-3 pr-4 text-brand-dark-text">Total</td>
                      <td className="pt-3 pr-4 text-center text-brand-muted">
                        {data.summary.lastYear.total}
                      </td>
                      <td className="pt-3 pr-4 text-center text-brand-dark-text">
                        {data.summary.thisYear.total}
                      </td>
                      <td className="pt-3 pr-4">
                        <DeltaBar
                          lastYear={data.summary.lastYear.total}
                          thisYear={data.summary.thisYear.total}
                        />
                      </td>
                      <td className="pt-3 pr-4 text-center">
                        <Badge
                          variant={
                            data.summary.retentionRate >= 70 ? 'success' : 'warning'
                          }
                        >
                          {data.summary.retentionRate}%
                        </Badge>
                      </td>
                      <td className="pt-3 text-center">--</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Lost Participants */}
          <Card>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setLostExpanded(!lostExpanded)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-base">
                    Lost Participants ({data.lostParticipants.length})
                  </CardTitle>
                  <Badge variant="danger">Not returning</Badge>
                </div>
                {lostExpanded ? (
                  <ChevronUp className="h-5 w-5 text-brand-muted" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-brand-muted" />
                )}
              </div>
            </CardHeader>
            {lostExpanded && (
              <CardContent>
                {/* Group filter */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setLostSortGroup(null)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      !lostSortGroup
                        ? 'bg-brand-navy text-white'
                        : 'bg-gray-100 text-brand-muted hover:bg-gray-200'
                    )}
                  >
                    All Groups
                  </button>
                  {lostGroupOptions.map((g) => (
                    <button
                      key={g}
                      onClick={() =>
                        setLostSortGroup(lostSortGroup === g ? null : g)
                      }
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        lostSortGroup === g
                          ? 'bg-brand-navy text-white'
                          : 'bg-gray-100 text-brand-muted hover:bg-gray-200'
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          Name
                        </th>
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          Previous Group
                        </th>
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          Grade
                        </th>
                        <th className="pb-2 font-medium text-brand-muted">
                          Contact ID
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(lostSortGroup
                        ? sortedLost.filter((p) => p.group === lostSortGroup)
                        : sortedLost
                      ).map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-brand-dark-text">
                            {p.name}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge>{p.group}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-brand-muted">
                            {p.grade || '--'}
                          </td>
                          <td className="py-2 font-mono text-xs text-brand-muted">
                            {p.contactId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Returned with Group Change */}
          {transitioned.length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setTransitionExpanded(!transitionExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">
                      Group Transitions ({transitioned.length})
                    </CardTitle>
                    <Badge variant="default">Moved groups</Badge>
                  </div>
                  {transitionExpanded ? (
                    <ChevronUp className="h-5 w-5 text-brand-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-brand-muted" />
                  )}
                </div>
              </CardHeader>
              {transitionExpanded && (
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="pb-2 pr-4 font-medium text-brand-muted">
                            Name
                          </th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">
                            Last Year
                          </th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted" />
                          <th className="pb-2 font-medium text-brand-muted">
                            This Year
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transitioned.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 pr-4 text-brand-dark-text">
                              {p.name}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant="muted">{p.lastYearGroup}</Badge>
                            </td>
                            <td className="py-2 pr-4">
                              <ArrowRight className="h-4 w-4 text-brand-muted" />
                            </td>
                            <td className="py-2">
                              <Badge variant="success">{p.thisYearGroup}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
