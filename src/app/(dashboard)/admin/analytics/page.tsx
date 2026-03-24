'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  Upload, FileSpreadsheet, Users, UserPlus, UserMinus, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, ArrowRight, Loader2, XCircle, BarChart3, RefreshCw, Trash2,
} from 'lucide-react';

/* ─── Types ─── */
interface Snapshot { id: string; year_label: string; total_count: number; uploaded_at: string }
interface Summary { yearA: { label: string; total: number }; yearB: { label: string; total: number }; returned: number; new: number; lost: number; retentionRate: number; growthRate: number }
interface GroupStat { slug: string; name: string; yearA: number; yearB: number; returned: number; new: number; lost: number; retentionPct: number }
interface LostP { name: string; group: string; grade: string; contactId: string }
interface ReturnedP { name: string; lastYearGroup: string; thisYearGroup: string; transitioned: boolean }
interface CompareResult { summary: Summary; byGroup: GroupStat[]; lostParticipants: LostP[]; returnedParticipants: ReturnedP[] }

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [yearLabel, setYearLabel] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Compare state
  const [yearA, setYearA] = useState('');
  const [yearB, setYearB] = useState('2025-2026');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [lostFilter, setLostFilter] = useState('all');

  // Fetch snapshots
  const { data: snapshotData, isLoading: loadingSnapshots } = useQuery<{ snapshots: Snapshot[]; currentYear: { year_label: string; total_count: number } }>({
    queryKey: ['analytics-snapshots'],
    queryFn: async () => { const r = await fetch('/api/admin/analytics'); if (!r.ok) throw new Error('Failed'); return r.json(); },
  });

  const snapshots = snapshotData?.snapshots ?? [];
  const allYears = [...snapshots.map((s) => s.year_label), '2025-2026'].sort();

  // Auto-select yearA when snapshots load
  useEffect(() => {
    if (snapshots.length > 0 && !yearA) {
      setYearA(snapshots[0].year_label);
    }
  }, [snapshots, yearA]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !yearLabel) throw new Error('File and year required');
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('year_label', yearLabel);
      const r = await fetch('/api/admin/analytics', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-snapshots'] });
      setSelectedFile(null);
      setYearLabel('');
    },
  });

  // Compare mutation
  const compareMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/analytics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearA, yearB }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json() as Promise<CompareResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.xlsx')) setSelectedFile(f);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSelectedFile(f);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Year-over-Year Analytics</h2>
        <p className="mt-1 text-sm text-brand-muted">Upload rosters from previous years and compare enrollment, retention, and growth</p>
      </div>

      {/* ─── Upload Section ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" />
            Upload Year Roster
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={yearLabel}
              onChange={(e) => setYearLabel(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select year...</option>
              <option value="2019-2020">2019-2020</option>
              <option value="2020-2021">2020-2021</option>
              <option value="2021-2022">2021-2022</option>
              <option value="2022-2023">2022-2023</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2024-2025">2024-2025</option>
            </select>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors',
                dragOver ? 'border-brand-coral bg-brand-coral/5' : 'border-gray-200 hover:border-brand-navy/30'
              )}
            >
              <FileSpreadsheet className="h-4 w-4 text-brand-muted" />
              <span className="text-sm text-brand-muted">
                {selectedFile ? selectedFile.name : 'Drop XLSX or click to browse'}
              </span>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileSelect} />
            </div>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || !yearLabel || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Save
            </Button>
          </div>
          {uploadMutation.isSuccess && (
            <p className="text-sm text-emerald-600">Saved {yearLabel} with {uploadMutation.data?.total} participants</p>
          )}
          {uploadMutation.isError && (
            <p className="text-sm text-red-600">{uploadMutation.error.message}</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Saved Snapshots ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Saved Years
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSnapshots ? (
            <Loader2 className="h-6 w-6 animate-spin text-brand-muted mx-auto" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {snapshots.map((s) => (
                <Badge key={s.id} className="bg-brand-navy/10 text-brand-navy px-3 py-1.5 text-sm">
                  {s.year_label} — {s.total_count} participants
                </Badge>
              ))}
              <Badge className="bg-emerald-50 text-emerald-700 px-3 py-1.5 text-sm">
                2025-2026 (current) — {snapshotData?.currentYear?.total_count ?? '...'} participants
              </Badge>
              {snapshots.length === 0 && (
                <p className="text-sm text-brand-muted">No years uploaded yet. Upload XLSX files above.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Compare Section ─── */}
      {allYears.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className="h-5 w-5" />
              Compare Years
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select value={yearA} onChange={(e) => setYearA(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ArrowRight className="h-4 w-4 text-brand-muted hidden sm:block" />
              <span className="text-sm text-brand-muted sm:hidden">vs</span>
              <select value={yearB} onChange={(e) => setYearB(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
                {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <Button onClick={() => compareMutation.mutate()} disabled={!yearA || !yearB || yearA === yearB || compareMutation.isPending}>
                {compareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Compare'}
              </Button>
            </div>
            {compareMutation.isError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <XCircle className="h-4 w-4" /> {compareMutation.error.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Results ─── */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-brand-dark-text">{result.summary.yearA.total}</p>
                <p className="text-xs text-brand-muted">{result.summary.yearA.label}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-brand-dark-text">{result.summary.yearB.total}</p>
                <p className="text-xs text-brand-muted">{result.summary.yearB.label}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{result.summary.retentionRate}%</p>
                <p className="text-xs text-brand-muted">Retention</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className={cn('text-2xl font-bold', result.summary.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {result.summary.growthRate > 0 ? '+' : ''}{result.summary.growthRate}%
                </p>
                <p className="text-xs text-brand-muted">Growth</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="flex justify-center gap-3">
                  <div><p className="text-lg font-bold text-emerald-600">{result.summary.returned}</p><p className="text-[10px] text-brand-muted">Returned</p></div>
                  <div><p className="text-lg font-bold text-blue-600">{result.summary.new}</p><p className="text-[10px] text-brand-muted">New</p></div>
                  <div><p className="text-lg font-bold text-red-500">{result.summary.lost}</p><p className="text-[10px] text-brand-muted">Lost</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Growth by Group */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Growth by Group</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-brand-muted">
                      <th className="py-2 pr-4">Group</th>
                      <th className="py-2 px-2 text-center">{result.summary.yearA.label}</th>
                      <th className="py-2 px-2 text-center">{result.summary.yearB.label}</th>
                      <th className="py-2 px-2 text-center">Delta</th>
                      <th className="py-2 px-2 text-center">Retention</th>
                      <th className="py-2 px-2">Visual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.byGroup.filter((g) => g.yearA > 0 || g.yearB > 0).map((g) => {
                      const delta = g.yearB - g.yearA;
                      const maxCount = Math.max(...result.byGroup.map((x) => Math.max(x.yearA, x.yearB)), 1);
                      return (
                        <tr key={g.slug} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium text-brand-dark-text">{g.name}</td>
                          <td className="py-2 px-2 text-center">{g.yearA}</td>
                          <td className="py-2 px-2 text-center font-semibold">{g.yearB}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={cn('font-semibold', delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400')}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Badge className={cn('text-xs', g.retentionPct >= 70 ? 'bg-emerald-50 text-emerald-700' : g.retentionPct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>
                              {g.retentionPct}%
                            </Badge>
                          </td>
                          <td className="py-2 px-2 w-40">
                            <div className="flex gap-0.5 items-end h-5">
                              <div className="bg-brand-navy/30 rounded-sm" style={{ width: `${(g.yearA / maxCount) * 100}%`, height: '60%' }} />
                              <div className="bg-brand-navy rounded-sm" style={{ width: `${(g.yearB / maxCount) * 100}%`, height: '100%' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Lost Participants */}
          <Card>
            <CardHeader>
              <button onClick={() => setShowLost(!showLost)} className="flex items-center justify-between w-full cursor-pointer">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserMinus className="h-5 w-5 text-red-500" />
                  Lost Participants ({result.lostParticipants.length})
                </CardTitle>
                {showLost ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </CardHeader>
            {showLost && (
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  <button onClick={() => setLostFilter('all')} className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', lostFilter === 'all' ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>All</button>
                  {[...new Set(result.lostParticipants.map((p) => p.group))].sort().map((g) => (
                    <button key={g} onClick={() => setLostFilter(g)} className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', lostFilter === g ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{g}</button>
                  ))}
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {result.lostParticipants.filter((p) => lostFilter === 'all' || p.group === lostFilter).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                      <span className="font-medium text-brand-dark-text">{p.name}</span>
                      <Badge className="bg-gray-100 text-gray-600 text-xs">{p.group}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Returned with Transitions */}
          <Card>
            <CardHeader>
              <button onClick={() => setShowReturned(!showReturned)} className="flex items-center justify-between w-full cursor-pointer">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  Returned Participants ({result.returnedParticipants.length})
                  {result.returnedParticipants.filter((p) => p.transitioned).length > 0 && (
                    <Badge className="bg-blue-50 text-blue-700 text-xs ml-2">
                      {result.returnedParticipants.filter((p) => p.transitioned).length} changed group
                    </Badge>
                  )}
                </CardTitle>
                {showReturned ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </CardHeader>
            {showReturned && (
              <CardContent>
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {result.returnedParticipants.filter((p) => p.transitioned).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                      <span className="font-medium text-brand-dark-text min-w-0 truncate">{p.name}</span>
                      <Badge className="bg-gray-100 text-gray-500 text-xs flex-shrink-0">{p.lastYearGroup}</Badge>
                      <ArrowRight className="h-3 w-3 text-brand-muted flex-shrink-0" />
                      <Badge className="bg-emerald-50 text-emerald-700 text-xs flex-shrink-0">{p.thisYearGroup}</Badge>
                    </div>
                  ))}
                  {result.returnedParticipants.filter((p) => p.transitioned).length === 0 && (
                    <p className="text-sm text-brand-muted py-2">No group transitions found</p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
