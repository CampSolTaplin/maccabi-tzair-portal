'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  Upload, FileSpreadsheet, Users, UserPlus, UserMinus, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, ArrowRight, Loader2, XCircle, BarChart3, RefreshCw,
  Download, GraduationCap, Baby, Activity,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/* ─── Types ─── */
interface Snapshot { id: string; year_label: string; total_count: number; uploaded_at: string }
interface Summary { yearA: { label: string; total: number }; yearB: { label: string; total: number }; returned: number; new: number; lost: number; graduated: number; expectedEntry: number; retentionRate: number; growthRate: number }
interface GroupStat { slug: string; name: string; yearA: number; yearB: number; returned: number; graduated: number; new: number; lost: number; retentionPct: number }
interface LostP { name: string; group: string; grade: string; contactId: string }
interface ReturnedP { name: string; lastYearGroup: string; thisYearGroup: string; transitioned: boolean }
interface CompareResult { summary: Summary; byGroup: GroupStat[]; lostParticipants: LostP[]; returnedParticipants: ReturnedP[]; graduatedParticipants: { name: string; group: string }[] }
interface TrendResult {
  years: string[];
  enrollmentTrend: { year: string; total: number }[];
  groupTrend: { slug: string; name: string; counts: { year: string; count: number }[] }[];
  retentionChain: { from: string; to: string; totalA: number; totalB: number; returned: number; lost: number; graduated: number; new: number; expectedEntry: number; retentionPct: number }[];
  cohorts: { startGroup: string; startGroupSlug: string; currentGroup: string; currentGroupSlug: string; startYear: string; size: number; journey: { year: string; expectedGroup: string; expectedGroupName: string; total: number; inExpected: number; inOther: number; lost: number; graduated: number }[] }[];
}

interface AttendanceGroup { id: string; name: string; slug: string; area: string; color: string }

/* ─── CSV Download Helper ─── */
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [yearLabel, setYearLabel] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [yearA, setYearA] = useState('');
  const [yearB, setYearB] = useState('2025-2026');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [trendResult, setTrendResult] = useState<TrendResult | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [showCohorts, setShowCohorts] = useState(false);
  const [lostFilter, setLostFilter] = useState('all');
  const [selectedTrendYears, setSelectedTrendYears] = useState<string[]>([]);
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());
  const [trendInitialized, setTrendInitialized] = useState(false);

  // Attendance trend data
  const { data: attendanceTrend, isLoading: loadingTrend } = useQuery<{
    groups: AttendanceGroup[];
    data: Record<string, string | number>[];
  }>({
    queryKey: ['attendance-trend'],
    queryFn: async () => {
      const r = await fetch('/api/admin/analytics/attendance-trend');
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
  });

  const trendGroups = attendanceTrend?.groups ?? [];
  const trendData = attendanceTrend?.data ?? [];

  // Initialize visible groups once data loads (default: all groups with data)
  useEffect(() => {
    if (trendGroups.length > 0 && !trendInitialized) {
      const slugsWithData = new Set<string>();
      for (const d of trendData) {
        for (const key of Object.keys(d)) {
          if (key !== 'date') slugsWithData.add(key);
        }
      }
      setVisibleGroups(slugsWithData);
      setTrendInitialized(true);
    }
  }, [trendGroups, trendData, trendInitialized]);

  function toggleGroup(slug: string) {
    setVisibleGroups(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const { data: snapshotData, isLoading: loadingSnapshots } = useQuery<{ snapshots: Snapshot[]; currentYear: { year_label: string; total_count: number } }>({
    queryKey: ['analytics-snapshots'],
    queryFn: async () => { const r = await fetch('/api/admin/analytics'); if (!r.ok) throw new Error('Failed'); return r.json(); },
  });

  const snapshots = snapshotData?.snapshots ?? [];
  const allYears = useMemo(() => [...snapshots.map((s) => s.year_label), '2025-2026'].sort(), [snapshots]);

  useEffect(() => {
    if (snapshots.length > 0 && !yearA) setYearA(snapshots[0].year_label);
  }, [snapshots, yearA]);

  // Auto-select all years for trend
  useEffect(() => {
    if (allYears.length >= 2 && selectedTrendYears.length === 0) setSelectedTrendYears(allYears);
  }, [allYears, selectedTrendYears.length]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !yearLabel) throw new Error('File and year required');
      const fd = new FormData(); fd.append('file', selectedFile); fd.append('year_label', yearLabel);
      const r = await fetch('/api/admin/analytics', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['analytics-snapshots'] }); setSelectedFile(null); setYearLabel(''); },
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/analytics', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yearA, yearB }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); } return r.json() as Promise<CompareResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const trendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/analytics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ years: selectedTrendYears }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); } return r.json() as Promise<TrendResult>;
    },
    onSuccess: (data) => setTrendResult(data),
  });

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.xlsx')) setSelectedFile(f); }, []);

  function toggleTrendYear(y: string) {
    setSelectedTrendYears((prev) => prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort());
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Year-over-Year Analytics</h2>
        <p className="mt-1 text-sm text-brand-muted">Upload rosters from previous years to compare enrollment, retention, and growth</p>
      </div>

      {/* ─── Attendance Trends ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Attendance Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTrend && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
            </div>
          )}

          {!loadingTrend && trendData.length > 0 && (
            <>
              {/* Group toggle chips */}
              <div className="flex flex-wrap gap-1.5">
                {trendGroups.map((g) => {
                  const active = visibleGroups.has(g.slug);
                  return (
                    <button
                      key={g.slug}
                      onClick={() => toggleGroup(g.slug)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border',
                        active
                          ? 'text-white border-transparent'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      )}
                      style={active ? { backgroundColor: g.color, borderColor: g.color } : undefined}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>

              {/* Chart */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d: string) => {
                        const dt = new Date(d + 'T12:00:00');
                        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      }}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      labelFormatter={(d) => {
                        const dt = new Date(String(d) + 'T12:00:00');
                        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      }}
                      formatter={(value, name) => {
                        const group = trendGroups.find(g => g.slug === String(name));
                        return [`${value}%`, group?.name ?? String(name)];
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    {trendGroups.map((g) => (
                      visibleGroups.has(g.slug) && (
                        <Line
                          key={g.slug}
                          type="monotone"
                          dataKey={g.slug}
                          stroke={g.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      )
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {!loadingTrend && trendData.length === 0 && (
            <p className="text-sm text-brand-muted text-center py-8">No attendance data available yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Upload ─── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Upload className="h-5 w-5" />Upload Year Roster</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
              <option value="">Select year...</option>
              {['2019-2020','2020-2021','2021-2022','2022-2023','2023-2024','2024-2025'].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => fileRef.current?.click()}
              className={cn('flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors', dragOver ? 'border-brand-coral bg-brand-coral/5' : 'border-gray-200 hover:border-brand-navy/30')}>
              <FileSpreadsheet className="h-4 w-4 text-brand-muted" />
              <span className="text-sm text-brand-muted">{selectedFile ? selectedFile.name : 'Drop XLSX or click to browse'}</span>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }} />
            </div>
            <Button onClick={() => uploadMutation.mutate()} disabled={!selectedFile || !yearLabel || uploadMutation.isPending}>
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Save
            </Button>
          </div>
          {uploadMutation.isSuccess && <p className="text-sm text-emerald-600">Saved {uploadMutation.data?.year_label} with {uploadMutation.data?.total} participants</p>}
          {uploadMutation.isError && <p className="text-sm text-red-600">{uploadMutation.error.message}</p>}
        </CardContent>
      </Card>

      {/* ─── Saved Years ─── */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" />Saved Years</CardTitle></CardHeader>
        <CardContent>
          {loadingSnapshots ? <Loader2 className="h-6 w-6 animate-spin text-brand-muted mx-auto" /> : (
            <div className="flex flex-wrap gap-2">
              {snapshots.map((s) => (
                <Badge key={s.id} className="bg-brand-navy/10 text-brand-navy px-3 py-1.5 text-sm">{s.year_label} — {s.total_count}</Badge>
              ))}
              <Badge className="bg-emerald-50 text-emerald-700 px-3 py-1.5 text-sm">2025-2026 (current) — {snapshotData?.currentYear?.total_count ?? '...'}</Badge>
              {snapshots.length === 0 && <p className="text-sm text-brand-muted">No years uploaded yet.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Two-Year Compare ─── */}
      {allYears.length >= 2 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><RefreshCw className="h-5 w-5" />Compare Two Years</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select value={yearA} onChange={(e) => setYearA(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ArrowRight className="h-4 w-4 text-brand-muted hidden sm:block" />
              <select value={yearB} onChange={(e) => setYearB(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <Button onClick={() => compareMutation.mutate()} disabled={!yearA || !yearB || yearA === yearB || compareMutation.isPending}>
                {compareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Compare'}
              </Button>
            </div>
            {compareMutation.isError && <div className="flex items-center gap-2 text-red-600 text-sm"><XCircle className="h-4 w-4" />{compareMutation.error.message}</div>}
          </CardContent>
        </Card>
      )}

      {/* ─── Compare Results ─── */}
      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-brand-dark-text">{result.summary.yearA.total}</p><p className="text-xs text-brand-muted">{result.summary.yearA.label}</p></CardContent></Card>
            <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-brand-dark-text">{result.summary.yearB.total}</p><p className="text-xs text-brand-muted">{result.summary.yearB.label}</p></CardContent></Card>
            <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-emerald-600">{result.summary.retentionRate}%</p><p className="text-xs text-brand-muted">Retention</p></CardContent></Card>
            <Card><CardContent className="py-4 text-center"><p className={cn('text-2xl font-bold', result.summary.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600')}>{result.summary.growthRate > 0 ? '+' : ''}{result.summary.growthRate}%</p><p className="text-xs text-brand-muted">Growth</p></CardContent></Card>
            <Card className="sm:col-span-2"><CardContent className="py-4 text-center">
              <div className="flex justify-center gap-4">
                <div><p className="text-lg font-bold text-emerald-600">{result.summary.returned}</p><p className="text-[10px] text-brand-muted">Returned</p></div>
                <div><p className="text-lg font-bold text-blue-600">{result.summary.new}</p><p className="text-[10px] text-brand-muted">New</p></div>
                <div><p className="text-lg font-bold text-red-500">{result.summary.lost}</p><p className="text-[10px] text-brand-muted">Lost</p></div>
                <div><p className="text-lg font-bold text-purple-600">{result.summary.graduated}</p><p className="text-[10px] text-brand-muted">Graduated</p></div>
                <div><p className="text-lg font-bold text-gray-400">{result.summary.expectedEntry}</p><p className="text-[10px] text-brand-muted">Kinder Entry</p></div>
              </div>
            </CardContent></Card>
          </div>

          {/* Growth by Group */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Growth by Group</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                downloadCSV('growth-by-group.csv', ['Group', `${result.summary.yearA.label}`, `${result.summary.yearB.label}`, 'Delta', 'Retention%'],
                  result.byGroup.filter((g) => g.yearA > 0 || g.yearB > 0).map((g) => [g.name, String(g.yearA), String(g.yearB), String(g.yearB - g.yearA), `${g.retentionPct}%`]));
              }}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-brand-muted">
                    <th className="py-2 pr-4">Group</th>
                    <th className="py-2 px-2 text-center">{result.summary.yearA.label}</th>
                    <th className="py-2 px-2 text-center">{result.summary.yearB.label}</th>
                    <th className="py-2 px-2 text-center">Delta</th>
                    <th className="py-2 px-2 text-center">Retention</th>
                    <th className="py-2 px-2">Visual</th>
                  </tr></thead>
                  <tbody>
                    {result.byGroup.filter((g) => g.yearA > 0 || g.yearB > 0).map((g) => {
                      const delta = g.yearB - g.yearA;
                      const maxCount = Math.max(...result.byGroup.map((x) => Math.max(x.yearA, x.yearB)), 1);
                      return (
                        <tr key={g.slug} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium text-brand-dark-text">{g.name}</td>
                          <td className="py-2 px-2 text-center">{g.yearA}</td>
                          <td className="py-2 px-2 text-center font-semibold">{g.yearB}</td>
                          <td className="py-2 px-2 text-center"><span className={cn('font-semibold', delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400')}>{delta > 0 ? '+' : ''}{delta}</span></td>
                          <td className="py-2 px-2 text-center"><Badge className={cn('text-xs', g.retentionPct >= 70 ? 'bg-emerald-50 text-emerald-700' : g.retentionPct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>{g.retentionPct}%</Badge></td>
                          <td className="py-2 px-2 w-40"><div className="flex gap-0.5 items-end h-5"><div className="bg-brand-navy/30 rounded-sm" style={{ width: `${(g.yearA / maxCount) * 100}%`, height: '60%' }} /><div className="bg-brand-navy rounded-sm" style={{ width: `${(g.yearB / maxCount) * 100}%`, height: '100%' }} /></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Lost Participants with bars */}
          <Card>
            <CardHeader>
              <button onClick={() => setShowLost(!showLost)} className="flex items-center justify-between w-full cursor-pointer">
                <CardTitle className="flex items-center gap-2 text-lg"><UserMinus className="h-5 w-5 text-red-500" />Lost Participants ({result.lostParticipants.length})</CardTitle>
                <div className="flex items-center gap-2">
                  {showLost && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); downloadCSV('lost-participants.csv', ['Name', `Group (${result.summary.yearA.label})`, 'Grade'], result.lostParticipants.map((p) => [p.name, p.group, p.grade])); }}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
                  {showLost ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </button>
            </CardHeader>
            {showLost && (
              <CardContent>
                {/* Bar chart by group */}
                {(() => {
                  const byGroup = new Map<string, LostP[]>();
                  for (const p of result.lostParticipants) {
                    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
                    byGroup.get(p.group)!.push(p);
                  }
                  const sorted = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length);
                  const maxCount = sorted[0]?.[1]?.length ?? 1;
                  return (
                    <div className="space-y-1.5 mb-4">
                      {sorted.map(([group, members]) => (
                        <div key={group} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-brand-dark-text w-20 text-right truncate">{group}</span>
                          <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max((members.length / maxCount) * 100, 8)}%` }}>
                              <span className="text-[10px] font-bold text-white">{members.length}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Filter + list */}
                <div className="flex flex-wrap gap-1 mb-3">
                  <button onClick={() => setLostFilter('all')} className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', lostFilter === 'all' ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>All</button>
                  {[...new Set(result.lostParticipants.map((p) => p.group))].sort().map((g) => (
                    <button key={g} onClick={() => setLostFilter(g)} className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', lostFilter === g ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{g}</button>
                  ))}
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {result.lostParticipants.filter((p) => lostFilter === 'all' || p.group === lostFilter).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                      <span className="font-medium text-brand-dark-text">{p.name}</span>
                      <Badge className="bg-red-50 text-red-600 text-xs">{p.group} ({result.summary.yearA.label})</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Returned Participants with bars */}
          <Card>
            <CardHeader>
              <button onClick={() => setShowReturned(!showReturned)} className="flex items-center justify-between w-full cursor-pointer">
                <CardTitle className="flex items-center gap-2 text-lg"><UserPlus className="h-5 w-5 text-emerald-600" />Returned Participants ({result.returnedParticipants.length})
                  {result.returnedParticipants.filter((p) => p.transitioned).length > 0 && <Badge className="bg-blue-50 text-blue-700 text-xs ml-2">{result.returnedParticipants.filter((p) => p.transitioned).length} changed group</Badge>}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {showReturned && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); downloadCSV('returned-participants.csv', ['Name', `Group (${result.summary.yearA.label})`, `Group (${result.summary.yearB.label})`, 'Changed'], result.returnedParticipants.map((p) => [p.name, p.lastYearGroup, p.thisYearGroup, p.transitioned ? 'Yes' : 'No'])); }}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
                  {showReturned ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </button>
            </CardHeader>
            {showReturned && (
              <CardContent>
                {(() => {
                  const byGroup = new Map<string, ReturnedP[]>();
                  for (const p of result.returnedParticipants) { if (!byGroup.has(p.thisYearGroup)) byGroup.set(p.thisYearGroup, []); byGroup.get(p.thisYearGroup)!.push(p); }
                  const sorted = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length);
                  const maxCount = sorted[0]?.[1]?.length ?? 1;
                  return (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        {sorted.map(([group, members]) => (
                          <div key={group} className="flex items-center gap-3">
                            <span className="text-xs font-medium text-brand-dark-text w-20 text-right truncate">{group}</span>
                            <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max((members.length / maxCount) * 100, 8)}%` }}>
                                <span className="text-[10px] font-bold text-white">{members.length}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-brand-muted w-16">{members.filter((p) => p.transitioned).length > 0 && `${members.filter((p) => p.transitioned).length} moved`}</span>
                          </div>
                        ))}
                      </div>
                      {result.returnedParticipants.filter((p) => p.transitioned).length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">Group Transitions</p>
                          <div className="max-h-60 overflow-y-auto space-y-1">
                            {result.returnedParticipants.filter((p) => p.transitioned).map((p, i) => (
                              <div key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 text-sm">
                                <span className="font-medium text-brand-dark-text min-w-0 truncate flex-1">{p.name}</span>
                                <Badge className="bg-gray-100 text-gray-500 text-[10px] flex-shrink-0">{p.lastYearGroup} ({result.summary.yearA.label})</Badge>
                                <ArrowRight className="h-3 w-3 text-brand-muted flex-shrink-0" />
                                <Badge className="bg-emerald-50 text-emerald-700 text-[10px] flex-shrink-0">{p.thisYearGroup} ({result.summary.yearB.label})</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            )}
          </Card>
        </>
      )}

      {/* ═══ Multi-Year Trend ═══ */}
      {allYears.length >= 3 && (
        <Card>
          <CardHeader>
            <button onClick={() => setShowTrend(!showTrend)} className="flex items-center justify-between w-full cursor-pointer">
              <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5" />Multi-Year Trend</CardTitle>
              {showTrend ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </CardHeader>
          {showTrend && (
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-brand-muted">Select years:</span>
                {allYears.map((y) => (
                  <button key={y} onClick={() => toggleTrendYear(y)} className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors', selectedTrendYears.includes(y) ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{y}</button>
                ))}
                <Button onClick={() => trendMutation.mutate()} disabled={selectedTrendYears.length < 2 || trendMutation.isPending} size="sm">
                  {trendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze Trend'}
                </Button>
              </div>

              {trendResult && (
                <div className="space-y-6">
                  {/* Enrollment trend line (CSS) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-brand-dark-text">Total Enrollment</h4>
                      <Button variant="outline" size="sm" onClick={() => downloadCSV('enrollment-trend.csv', ['Year', 'Total'], trendResult.enrollmentTrend.map((t) => [t.year, String(t.total)]))}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
                    </div>
                    <div className="flex items-end gap-3 h-32">
                      {trendResult.enrollmentTrend.map((t, i) => {
                        const max = Math.max(...trendResult.enrollmentTrend.map((x) => x.total));
                        return (
                          <div key={t.year} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-brand-dark-text">{t.total}</span>
                            <div className="w-full bg-brand-navy rounded-t" style={{ height: `${(t.total / max) * 100}%` }} />
                            <span className="text-[10px] text-brand-muted">{t.year.split('-')[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Retention chain */}
                  <div>
                    <h4 className="text-sm font-semibold text-brand-dark-text mb-2">Year-over-Year Retention</h4>
                    <div className="flex flex-wrap gap-2">
                      {trendResult.retentionChain.map((r) => (
                        <Card key={r.from + r.to} className="flex-1 min-w-[140px]">
                          <CardContent className="py-3 text-center">
                            <p className="text-[10px] text-brand-muted">{r.from} → {r.to}</p>
                            <p className={cn('text-xl font-bold', r.retentionPct >= 70 ? 'text-emerald-600' : r.retentionPct >= 50 ? 'text-amber-600' : 'text-red-600')}>{r.retentionPct}%</p>
                            <div className="flex justify-center gap-2 mt-1 text-[10px]">
                              <span className="text-red-500">{r.lost} lost</span>
                              <span className="text-purple-500">{r.graduated} grad</span>
                              <span className="text-blue-500">{r.new} new</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Group trend table */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-brand-dark-text">Enrollment by Group</h4>
                      <Button variant="outline" size="sm" onClick={() => {
                        const years = trendResult.years;
                        downloadCSV('group-trend.csv', ['Group', ...years], trendResult.groupTrend.map((g) => [g.name, ...g.counts.map((c) => String(c.count))]));
                      }}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left text-brand-muted">
                          <th className="py-2 pr-4">Group</th>
                          {trendResult.years.map((y) => <th key={y} className="py-2 px-2 text-center text-xs">{y.split('-')[0]}</th>)}
                        </tr></thead>
                        <tbody>
                          {trendResult.groupTrend.map((g) => (
                            <tr key={g.slug} className="border-b border-gray-50">
                              <td className="py-2 pr-4 font-medium text-brand-dark-text">{g.name}</td>
                              {g.counts.map((c, i) => {
                                const prev = i > 0 ? g.counts[i - 1].count : c.count;
                                const delta = c.count - prev;
                                return (
                                  <td key={c.year} className="py-2 px-2 text-center">
                                    <span className="font-semibold">{c.count}</span>
                                    {i > 0 && delta !== 0 && <span className={cn('ml-1 text-[10px]', delta > 0 ? 'text-emerald-500' : 'text-red-500')}>{delta > 0 ? '+' : ''}{delta}</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ═══ Cohort Tracking ═══ */}
      {trendResult && trendResult.cohorts.length > 0 && (
        <Card>
          <CardHeader>
            <button onClick={() => setShowCohorts(!showCohorts)} className="flex items-center justify-between w-full cursor-pointer">
              <CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5" />Cohort Tracking (Follow groups through years)</CardTitle>
              {showCohorts ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </CardHeader>
          {showCohorts && (
            <CardContent>
              <p className="text-xs text-brand-muted mb-4">Each row tracks a group of participants from {trendResult.years[0]} through their natural progression (e.g., 5th Grade → 6th Grade → 7th Grade)</p>
              <div className="space-y-4">
                {trendResult.cohorts.map((cohort, ci) => {
                  const retentionPct = cohort.journey.length > 1 ? Math.round(((cohort.journey[cohort.journey.length - 1].inExpected + cohort.journey[cohort.journey.length - 1].inOther) / cohort.size) * 100) : 100;
                  return (
                    <div key={ci} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-brand-navy text-white text-xs">{cohort.currentGroup} ({trendResult.years[trendResult.years.length - 1]})</Badge>
                          <span className="text-xs text-brand-muted">Was {cohort.startGroup} in {cohort.startYear} · Started with {cohort.size}</span>
                        </div>
                        <Badge className={cn('text-xs', retentionPct >= 70 ? 'bg-emerald-50 text-emerald-700' : retentionPct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>
                          {retentionPct}% retained
                        </Badge>
                      </div>
                      {/* Journey visualization */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1">
                        {cohort.journey.map((step, si) => (
                          <div key={si} className="flex items-center gap-1 flex-shrink-0">
                            <div className="text-center min-w-[80px] rounded-lg border p-2">
                              <p className="text-[10px] text-brand-muted">{step.year.split('-')[0]}</p>
                              <p className="text-[10px] font-medium text-brand-dark-text">{step.expectedGroupName}</p>
                              <div className="mt-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((step.inExpected + step.inOther) / step.total) * 100}%` }} />
                              </div>
                              <p className="text-[10px] font-bold mt-0.5">{step.inExpected + step.inOther}/{step.total}</p>
                            </div>
                            {si < cohort.journey.length - 1 && <ArrowRight className="h-3 w-3 text-brand-muted flex-shrink-0" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                const headers = ['Current Group', 'Starting Group', 'Starting Year', 'Initial Size', ...trendResult.years.map((y) => `Active (${y})`), 'Final Retention%'];
                const rows = trendResult.cohorts.map((c) => [
                  c.currentGroup, c.startGroup, c.startYear, String(c.size),
                  ...c.journey.map((j) => String(j.inExpected + j.inOther)),
                  `${Math.round(((c.journey[c.journey.length - 1].inExpected + c.journey[c.journey.length - 1].inOther) / c.size) * 100)}%`,
                ]);
                downloadCSV('cohort-tracking.csv', headers, rows);
              }}><Download className="h-3.5 w-3.5 mr-1" />Export Cohorts CSV</Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
