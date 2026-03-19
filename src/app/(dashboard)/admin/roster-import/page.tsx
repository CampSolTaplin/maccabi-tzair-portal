'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  UserPlus,
  UserCheck,
  Minus,
  Link2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

/* ─── Types ─── */

interface PreviewResult {
  totalRows: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  newMemberships: number;
  changes: {
    name: string;
    contactId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  newParticipants: {
    name: string;
    contactId: string;
    grade: string | null;
    groupSlug: string | null;
    school: string | null;
  }[];
  unmappedGroups: string[];
}

interface ImportResult {
  totalRows: number;
  newParticipants: number;
  updatedParticipants: number;
  unchangedParticipants: number;
  newMemberships: number;
  errors: { row: number; name: string; error: string }[];
  changes: {
    name: string;
    contactId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

interface GroupStat {
  id: string;
  name: string;
  slug: string;
  participantCount: number;
}

/* ─── Stat Mini-Card ─── */

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${bg} flex items-center gap-3`}>
      <div className={`rounded-lg p-2 ${color} bg-white/60`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function RosterImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewRowCount, setPreviewRowCount] = useState<number | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [newExpanded, setNewExpanded] = useState(false);

  // Fetch current roster stats
  const { data: statsData } = useQuery<{
    stats: GroupStat[];
    totalParticipants: number;
  }>({
    queryKey: ['roster-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/roster/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const stats = statsData?.stats ?? [];
  const totalParticipants = statsData?.totalParticipants ?? 0;

  /* ─── File Handling ─── */

  const handleFile = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setPreview(null);
      setImportResult(null);
      setError(null);
      setPreviewRowCount(null);

      // Auto-preview
      setPreviewing(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const res = await fetch('/api/admin/roster/preview', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Preview failed with status ${res.status}`);
        }

        const data = await res.json();
        setPreview(data.preview);
        setPreviewRowCount(data.rowCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setPreviewing(false);
      }
    },
    []
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
      const selectedFile = e.target.files?.[0];
      if (selectedFile) handleFile(selectedFile);
    },
    [handleFile]
  );

  /* ─── Import ─── */

  const handleImport = useCallback(async () => {
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/roster/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Import failed with status ${res.status}`);
      }

      const data = await res.json();
      setImportResult(data.result);
      setPreview(null); // Clear preview after successful import
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [file]);

  /* ─── Reset ─── */

  const handleReset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setError(null);
    setPreviewRowCount(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Roster Import</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Upload a Salesforce CSV/XLSX export to import or update participant rosters
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-navy" />
            <CardTitle>Upload Roster File</CardTitle>
          </div>
          <CardDescription>
            Accepts .csv, .xlsx, or .xls files exported from Salesforce
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all
                ${
                  dragActive
                    ? 'border-brand-navy bg-brand-light-blue'
                    : 'border-gray-300 bg-gray-50 hover:border-brand-navy/50 hover:bg-brand-light-blue/50'
                }
              `}
            >
              <div className="rounded-full bg-brand-light-blue p-4">
                <Upload className="h-8 w-8 text-brand-navy" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-brand-dark-text">
                  Drag and drop your file here, or click to browse
                </p>
                <p className="mt-1 text-xs text-brand-muted">
                  Supports CSV, XLSX, and XLS files
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-light-blue p-2">
                  <FileSpreadsheet className="h-5 w-5 text-brand-navy" />
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-dark-text">
                    {file.name}
                  </p>
                  <p className="text-xs text-brand-muted">
                    {(file.size / 1024).toFixed(1)} KB
                    {previewRowCount != null && ` \u00B7 ${previewRowCount} rows`}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                Change file
              </Button>
            </div>
          )}

          {previewing && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-brand-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing file...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Section */}
      {preview && !importResult && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              label="New Participants"
              value={preview.newCount}
              icon={UserPlus}
              color="text-emerald-700"
              bg="bg-emerald-50"
            />
            <MiniStat
              label="To Update"
              value={preview.updateCount}
              icon={UserCheck}
              color="text-amber-700"
              bg="bg-amber-50"
            />
            <MiniStat
              label="Unchanged"
              value={preview.unchangedCount}
              icon={Minus}
              color="text-gray-600"
              bg="bg-gray-100"
            />
            <MiniStat
              label="New Memberships"
              value={preview.newMemberships}
              icon={Link2}
              color="text-blue-700"
              bg="bg-blue-50"
            />
          </div>

          {/* Unmapped Groups Warning */}
          {preview.unmappedGroups.length > 0 && (
            <Card className="border-amber-200">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Unmapped Course Segments</p>
                  <p className="mt-1 text-sm text-amber-700">
                    The following course segments could not be mapped to a group:{' '}
                    {preview.unmappedGroups.map((g, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                          {g}
                        </code>
                      </span>
                    ))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Changes Detected */}
          {preview.changes.length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setChangesExpanded(!changesExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Changes</Badge>
                    <CardTitle className="text-base">
                      Changes Detected ({preview.changes.length})
                    </CardTitle>
                  </div>
                  {changesExpanded ? (
                    <ChevronUp className="h-5 w-5 text-brand-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-brand-muted" />
                  )}
                </div>
              </CardHeader>
              {changesExpanded && (
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Name</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Field</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Old Value</th>
                          <th className="pb-2 font-medium text-brand-muted">New Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.changes.map((c, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-4 text-brand-dark-text">{c.name}</td>
                            <td className="py-2 pr-4">
                              <Badge variant="muted">{c.field}</Badge>
                            </td>
                            <td className="py-2 pr-4 text-red-600 line-through">
                              {c.oldValue}
                            </td>
                            <td className="py-2 text-emerald-600 font-medium">
                              {c.newValue}
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

          {/* New Participants */}
          {preview.newParticipants.length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setNewExpanded(!newExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">New</Badge>
                    <CardTitle className="text-base">
                      New Participants ({preview.newParticipants.length})
                    </CardTitle>
                  </div>
                  {newExpanded ? (
                    <ChevronUp className="h-5 w-5 text-brand-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-brand-muted" />
                  )}
                </div>
              </CardHeader>
              {newExpanded && (
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Name</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Grade</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Group</th>
                          <th className="pb-2 font-medium text-brand-muted">School</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.newParticipants.map((p, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-4 text-brand-dark-text">{p.name}</td>
                            <td className="py-2 pr-4 text-brand-muted">{p.grade ?? '--'}</td>
                            <td className="py-2 pr-4">
                              {p.groupSlug ? (
                                <Badge>{p.groupSlug}</Badge>
                              ) : (
                                <span className="text-brand-muted">--</span>
                              )}
                            </td>
                            <td className="py-2 text-brand-muted">{p.school ?? '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={handleImport}
              loading={importing}
              disabled={importing}
              className="min-w-[180px]"
            >
              {importing ? (
                'Importing...'
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Import All
                </>
              )}
            </Button>
            <Button variant="outline" size="lg" onClick={handleReset} disabled={importing}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Import Results */}
      {importResult && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <CardTitle>Import Complete</CardTitle>
              </div>
              <CardDescription>
                Processed {importResult.totalRows} rows from the uploaded file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MiniStat
                  label="New Participants"
                  value={importResult.newParticipants}
                  icon={UserPlus}
                  color="text-emerald-700"
                  bg="bg-emerald-50"
                />
                <MiniStat
                  label="Updated"
                  value={importResult.updatedParticipants}
                  icon={UserCheck}
                  color="text-amber-700"
                  bg="bg-amber-50"
                />
                <MiniStat
                  label="Unchanged"
                  value={importResult.unchangedParticipants}
                  icon={Minus}
                  color="text-gray-600"
                  bg="bg-gray-100"
                />
                <MiniStat
                  label="New Memberships"
                  value={importResult.newMemberships}
                  icon={Link2}
                  color="text-blue-700"
                  bg="bg-blue-50"
                />
                <MiniStat
                  label="Errors"
                  value={importResult.errors.length}
                  icon={XCircle}
                  color="text-red-700"
                  bg="bg-red-50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Changes Applied */}
          {importResult.changes.length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setChangesExpanded(!changesExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Applied</Badge>
                    <CardTitle className="text-base">
                      Changes Applied ({importResult.changes.length})
                    </CardTitle>
                  </div>
                  {changesExpanded ? (
                    <ChevronUp className="h-5 w-5 text-brand-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-brand-muted" />
                  )}
                </div>
              </CardHeader>
              {changesExpanded && (
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Name</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Field</th>
                          <th className="pb-2 pr-4 font-medium text-brand-muted">Old</th>
                          <th className="pb-2 font-medium text-brand-muted">New</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResult.changes.map((c, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-4 text-brand-dark-text">{c.name}</td>
                            <td className="py-2 pr-4">
                              <Badge variant="muted">{c.field}</Badge>
                            </td>
                            <td className="py-2 pr-4 text-red-600 line-through">
                              {c.oldValue}
                            </td>
                            <td className="py-2 text-emerald-600 font-medium">
                              {c.newValue}
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

          {/* Errors */}
          {importResult.errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setErrorsExpanded(!errorsExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base">
                      Errors ({importResult.errors.length})
                    </CardTitle>
                  </div>
                  {errorsExpanded ? (
                    <ChevronUp className="h-5 w-5 text-brand-muted" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-brand-muted" />
                  )}
                </div>
              </CardHeader>
              {errorsExpanded && (
                <CardContent>
                  <div className="space-y-2">
                    {importResult.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm"
                      >
                        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-red-800">
                            Row {err.row}: {err.name}
                          </p>
                          <p className="text-red-600">{err.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Import Again */}
          <Button variant="outline" onClick={handleReset}>
            Import Another File
          </Button>
        </>
      )}

      {/* Current Roster Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-navy" />
            <CardTitle>Current Roster</CardTitle>
          </div>
          <CardDescription>
            {totalParticipants} active participants across {stats.length} groups
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-muted">
              No groups found. Groups need to be seeded first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {stats.map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                >
                  <p className="text-2xl font-bold text-brand-dark-text">
                    {group.participantCount}
                  </p>
                  <p className="mt-1 text-xs font-medium text-brand-muted">
                    {group.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
