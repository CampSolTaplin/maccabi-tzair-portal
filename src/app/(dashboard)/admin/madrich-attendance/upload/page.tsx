'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Upload,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Status = 'present' | 'late' | 'excused' | 'absent';

interface GroupOption {
  id: string;
  name: string;
  slug: string;
  area: string | null;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: 'madrich' | 'mazkirut';
}

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  title: string | null;
  isLocked: boolean;
  isLockedStaff: boolean;
}

interface GroupDetail {
  group: GroupOption;
  members: StaffMember[];
  sessions: SessionRow[];
}

interface ParsedColumn {
  colIndex: number;
  header: string; // row 1 label ("Planning", "SOM", etc)
  rawDate: string; // row 2 as typed
  parsedDate: string | null; // normalized YYYY-MM-DD or null
  matchedSessionId: string | null;
}

interface ParsedRow {
  rowIndex: number;
  rawName: string;
  firstName: string;
  lastName: string;
  matchedProfileId: string | null;
}

interface ParsedCell {
  rowIndex: number;
  colIndex: number;
  raw: string;
  status: Status | null;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitName(raw: string): { firstName: string; lastName: string } {
  const s = raw.trim();
  if (!s) return { firstName: '', lastName: '' };
  // "Last, First" format
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim());
    return { firstName: first ?? '', lastName: last ?? '' };
  }
  // "First Last" format — last word is last name
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts.pop()!;
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

function interpretStatus(raw: unknown): Status | null {
  if (raw === true) return 'present';
  if (raw === false) return null;
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v || v === '0' || v === 'no' || v === 'n' || v === '-') return null;
  if (v === 'x' || v === 'p' || v === '✓' || v === '✔' || v === 'true' || v === 'yes' || v === 'y' || v === '1' || v === 'present') return 'present';
  if (v === 'l' || v === 'late') return 'late';
  if (v === 'e' || v === 'ex' || v === 'excused') return 'excused';
  if (v === 'a' || v === 'abs' || v === 'absent') return 'absent';
  return null;
}

function parseExcelDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  // xlsx gives us Date objects for cells typed as dates when cellDates:true
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number') {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = raw * 86400 * 1000;
    const d = new Date(epoch.getTime() + ms);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Try native Date parse on strings like "Wed Aug 20 2025", "2025-08-20", etc.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  // Try "Wed Aug 20" (no year) → assume current year first, then +/- 1
  const noYear = s.replace(/^[A-Za-z]{3,}\s+/, ''); // strip leading weekday
  for (const year of [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() + 1]) {
    const guess = new Date(`${noYear} ${year}`);
    if (!isNaN(guess.getTime())) return guess.toISOString().slice(0, 10);
  }
  return null;
}

function formatDateHuman(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function UploadInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupIdParam = searchParams.get('groupId');

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groupIdParam);

  // Load groups the caller can manage (for the picker when no groupId passed)
  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['staff-att-groups'],
    queryFn: async () => {
      const res = await fetch('/api/admin/madrich-attendance/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      return res.json();
    },
  });
  const groups = groupsData?.groups ?? [];

  // Load group detail once the user has picked a group
  const { data: groupDetail } = useQuery<GroupDetail>({
    queryKey: ['staff-att-group', selectedGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/madrich-attendance/${selectedGroupId}`);
      if (!res.ok) throw new Error('Failed to load group');
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  const [fileName, setFileName] = useState<string | null>(null);
  const [columns, setColumns] = useState<ParsedColumn[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [cells, setCells] = useState<ParsedCell[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    succeeded: number;
    failed: number;
    errors: Array<{ profileId: string; sessionId: string; reason: string }>;
  } | null>(null);

  const nameIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of groupDetail?.members ?? []) {
      const full = normalizeName(`${m.firstName} ${m.lastName}`);
      const rev = normalizeName(`${m.lastName} ${m.firstName}`);
      map.set(full, m.id);
      map.set(rev, m.id);
    }
    return map;
  }, [groupDetail]);

  const sessionDateIndex = useMemo(() => {
    const map = new Map<string, SessionRow>();
    for (const s of groupDetail?.sessions ?? []) {
      map.set(s.sessionDate, s);
    }
    return map;
  }, [groupDetail]);

  const onFileChosen = useCallback(
    async (file: File) => {
      if (!groupDetail) return;
      setFileName(file.name);
      setImportResult(null);

      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        raw: true,
        defval: null,
      });

      if (grid.length < 3) {
        setColumns([]);
        setRows([]);
        setCells([]);
        return;
      }

      // Row 1 (index 0) = session type header, Row 2 (index 1) = date
      const headerRow = grid[0] ?? [];
      const dateRow = grid[1] ?? [];

      const colCount = Math.max(headerRow.length, dateRow.length);
      const parsedCols: ParsedColumn[] = [];
      for (let c = 1; c < colCount; c++) {
        const rawDate = dateRow[c] ?? headerRow[c];
        const parsedDate = parseExcelDate(rawDate);
        parsedCols.push({
          colIndex: c,
          header: String(headerRow[c] ?? '').trim(),
          rawDate: rawDate instanceof Date ? rawDate.toDateString() : String(rawDate ?? ''),
          parsedDate,
          matchedSessionId: parsedDate
            ? sessionDateIndex.get(parsedDate)?.id ?? null
            : null,
        });
      }

      // Rows 3+ (index 2+) = name in col A, data in rest
      const parsedRows: ParsedRow[] = [];
      const parsedCells: ParsedCell[] = [];

      for (let r = 2; r < grid.length; r++) {
        const row = grid[r];
        const rawName = String(row?.[0] ?? '').trim();
        if (!rawName) continue;

        const { firstName, lastName } = splitName(rawName);
        const matchedProfileId =
          nameIndex.get(normalizeName(`${firstName} ${lastName}`)) ??
          nameIndex.get(normalizeName(rawName)) ??
          null;

        parsedRows.push({
          rowIndex: r,
          rawName,
          firstName,
          lastName,
          matchedProfileId,
        });

        for (const col of parsedCols) {
          const raw = row?.[col.colIndex];
          const status = interpretStatus(raw);
          if (status === null) continue;
          parsedCells.push({
            rowIndex: r,
            colIndex: col.colIndex,
            raw: String(raw ?? ''),
            status,
          });
        }
      }

      setColumns(parsedCols);
      setRows(parsedRows);
      setCells(parsedCells);
    },
    [groupDetail, nameIndex, sessionDateIndex]
  );

  const plan = useMemo(() => {
    const importable: Array<{ profileId: string; sessionId: string; status: Status }> = [];
    const skipped: Array<{ reason: string; row: number; col: number }> = [];

    for (const cell of cells) {
      const row = rows.find((r) => r.rowIndex === cell.rowIndex);
      const col = columns.find((c) => c.colIndex === cell.colIndex);
      if (!row || !col) continue;
      if (!row.matchedProfileId) {
        skipped.push({ reason: `Name not found: ${row.rawName}`, row: cell.rowIndex, col: cell.colIndex });
        continue;
      }
      if (!col.matchedSessionId) {
        skipped.push({ reason: `Session not found for ${col.rawDate}`, row: cell.rowIndex, col: cell.colIndex });
        continue;
      }
      importable.push({
        profileId: row.matchedProfileId,
        sessionId: col.matchedSessionId,
        status: cell.status!,
      });
    }

    return { importable, skipped };
  }, [cells, rows, columns]);

  const unmatchedNames = rows.filter((r) => !r.matchedProfileId);
  const unmatchedDates = columns.filter((c) => !c.matchedSessionId);
  const matchedNames = rows.filter((r) => r.matchedProfileId);
  const matchedDates = columns.filter((c) => c.matchedSessionId);

  async function handleImport() {
    if (!selectedGroupId || plan.importable.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/madrich-attendance/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedGroupId,
          records: plan.importable,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setImportResult({
          succeeded: 0,
          failed: plan.importable.length,
          errors: [{ profileId: '', sessionId: '', reason: body?.error || 'Request failed' }],
        });
        return;
      }
      setImportResult({
        succeeded: body.succeeded ?? 0,
        failed: body.failed ?? 0,
        errors: body.errors ?? [],
      });
    } finally {
      setImporting(false);
    }
  }

  // ─── Group picker (no group selected) ───
  if (!selectedGroupId) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push('/admin/madrich-attendance')}
          className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Upload Staff Attendance</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Pick the group the spreadsheet is for.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-brand-navy/30 hover:shadow-md cursor-pointer"
            >
              <div>
                <p className="font-semibold text-brand-dark-text">{g.name}</p>
                {g.area && (
                  <p className="text-xs text-brand-muted uppercase tracking-wider mt-0.5">
                    {g.area}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Upload + preview ───
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        onClick={() => router.push('/admin/madrich-attendance')}
        className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Staff Attendance
      </button>

      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <FileSpreadsheet className="h-7 w-7" />
          <h1 className="text-2xl font-bold">Upload Staff Attendance</h1>
        </div>
        <p className="text-white/80">
          {groupDetail?.group.name ?? '…'}
        </p>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          <div>
            <h3 className="font-semibold text-brand-dark-text">Expected file format</h3>
            <ul className="mt-2 text-sm text-brand-muted list-disc list-inside space-y-0.5">
              <li><strong>Column A:</strong> staff name, one per row (from row 3 down).</li>
              <li><strong>Row 1:</strong> session type label (e.g. &quot;Planning&quot;, &quot;SOM&quot;). Not required, used for context only.</li>
              <li><strong>Row 2:</strong> the session date (e.g. <code>Wed Aug 20</code>, <code>8/20/2025</code>, <code>2025-08-20</code>).</li>
              <li>
                <strong>Data cells:</strong> any of <code>X</code>, <code>P</code>, <code>✓</code>, <code>TRUE</code>, <code>yes</code>, <code>present</code> → Present.
                <br />
                <code>L</code>/late → Late, <code>E</code>/excused → Excused, <code>A</code>/absent → Absent. Empty cell → skipped (no record created).
              </li>
            </ul>
          </div>

          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-10 px-6 cursor-pointer hover:border-brand-navy/40 hover:bg-gray-100 transition-colors"
          >
            <Upload className="h-10 w-10 text-brand-muted mb-3" />
            <p className="text-sm font-medium text-brand-dark-text">
              {fileName ? fileName : 'Click to choose an .xlsx file'}
            </p>
            <p className="text-xs text-brand-muted mt-1">
              {fileName ? 'Click again to pick a different file' : 'Or drag and drop'}
            </p>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileChosen(f);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {fileName && columns.length > 0 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <h3 className="font-semibold text-brand-dark-text">Preview</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  Matches
                </div>
                <ul className="mt-1 text-emerald-900">
                  <li>{matchedNames.length} / {rows.length} names matched</li>
                  <li>{matchedDates.length} / {columns.length} dates matched</li>
                  <li><strong>{plan.importable.length}</strong> attendance rows ready to import</li>
                </ul>
              </div>
              <div
                className={cn(
                  'rounded-lg border px-4 py-3',
                  unmatchedNames.length === 0 && unmatchedDates.length === 0
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-amber-200 bg-amber-50'
                )}
              >
                <div
                  className={cn(
                    'flex items-center gap-2 font-semibold',
                    unmatchedNames.length === 0 && unmatchedDates.length === 0
                      ? 'text-gray-500'
                      : 'text-amber-800'
                  )}
                >
                  <AlertCircle className="h-4 w-4" />
                  Not matched
                </div>
                <ul
                  className={cn(
                    'mt-1',
                    unmatchedNames.length === 0 && unmatchedDates.length === 0
                      ? 'text-gray-500'
                      : 'text-amber-900'
                  )}
                >
                  <li>{unmatchedNames.length} unmatched names</li>
                  <li>{unmatchedDates.length} unmatched dates</li>
                  <li>{plan.skipped.length} cells will be skipped</li>
                </ul>
              </div>
            </div>

            {unmatchedNames.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
                  Unmatched names
                </p>
                <ul className="text-xs text-amber-900 list-disc list-inside space-y-0.5">
                  {unmatchedNames.slice(0, 20).map((n) => (
                    <li key={n.rowIndex}>{n.rawName}</li>
                  ))}
                  {unmatchedNames.length > 20 && <li>…and {unmatchedNames.length - 20} more</li>}
                </ul>
              </div>
            )}

            {unmatchedDates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
                  Unmatched dates
                </p>
                <ul className="text-xs text-amber-900 list-disc list-inside space-y-0.5">
                  {unmatchedDates.slice(0, 20).map((c) => (
                    <li key={c.colIndex}>
                      {c.header ? <span className="text-amber-700">[{c.header}] </span> : null}
                      {c.rawDate || '(blank)'} {c.parsedDate && <span className="text-amber-700">→ {c.parsedDate}</span>}
                    </li>
                  ))}
                  {unmatchedDates.length > 20 && <li>…and {unmatchedDates.length - 20} more</li>}
                </ul>
                <p className="mt-1 text-xs text-amber-700">
                  Tip: these dates exist in your file but don&apos;t have a
                  session on that date in this group. Generate the season in{' '}
                  <code>/admin/sessions</code> first if needed.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleImport}
                disabled={importing || plan.importable.length === 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${plan.importable.length} records`
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card
          className={cn(
            'border',
            importResult.failed === 0 ? 'border-emerald-200' : 'border-amber-200'
          )}
        >
          <CardContent className="py-5 space-y-2">
            <h3 className="font-semibold text-brand-dark-text">Import result</h3>
            <p className="text-sm text-brand-muted">
              Succeeded: <strong className="text-emerald-700">{importResult.succeeded}</strong> ·
              Failed: <strong className="text-red-700">{importResult.failed}</strong>
            </p>
            {importResult.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wider mb-1">
                  Errors
                </p>
                <ul className="text-xs text-red-900 list-disc list-inside space-y-0.5 max-h-48 overflow-y-auto">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>{e.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => router.push('/admin/madrich-attendance')}
              >
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
        </div>
      }
    >
      <UploadInner />
    </Suspense>
  );
}
