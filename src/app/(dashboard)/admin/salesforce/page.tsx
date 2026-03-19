'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  CloudDownload,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  UserPlus,
  UserCheck,
  UserX,
  Link2,
  Loader2,
  RefreshCw,
  Clock,
  Hash,
} from 'lucide-react';

/* ─── Types (to be moved to shared types later) ─── */

interface SyncResult {
  totalProcessed: number;
  participantsCreated: number;
  participantsUpdated: number;
  participantsSkipped: number;
  parentsCreated: number;
  parentsUpdated: number;
  parentsSkipped: number;
  relationshipsCreated: number;
  membershipsCreated: number;
  errors: { contactId: string; contactName: string; error: string }[];
  missingEmails?: {
    name: string;
    grade?: string;
    school?: string;
    salesforceId: string;
  }[];
}

interface NewUserCredential {
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  salesforceId: string;
}

interface SyncHistoryEntry {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'success' | 'failed' | 'running';
  records_synced: number;
  created: number;
  updated: number;
  errors: number;
  duration_ms: number | null;
}

/* ─── Helpers ─── */

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function downloadCredentialsCsv(credentials: NewUserCredential[]) {
  const header = 'Role,First Name,Last Name,Email,Temporary Password,Salesforce ID';
  const rows = credentials.map(
    (c) =>
      `${c.role},${c.firstName},${c.lastName},${c.email},${c.temporaryPassword},${c.salesforceId}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `salesforce-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ─── Stat Card ─── */

function StatCard({
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

/* ─── Status Badge ─── */

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <Badge variant="success">Success</Badge>;
    case 'failed':
      return <Badge variant="danger">Failed</Badge>;
    case 'running':
      return <Badge variant="warning">Running</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

/* ─── Main Page ─── */

export default function SalesforceSyncPage() {
  const queryClient = useQueryClient();

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [credentials, setCredentials] = useState<NewUserCredential[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Fetch sync history
  const { data: historyData } = useQuery<{ history: SyncHistoryEntry[] }>({
    queryKey: ['salesforce-sync-history'],
    queryFn: async () => {
      const res = await fetch('/api/admin/salesforce/status');
      if (!res.ok) throw new Error('Failed to fetch sync history');
      return res.json();
    },
    refetchInterval: syncing ? 5000 : false,
  });

  const history = historyData?.history ?? [];

  const handleSync = useCallback(async () => {
    setShowConfirm(false);
    setSyncing(true);
    setSyncResult(null);
    setCredentials(null);
    setSyncError(null);
    setErrorsExpanded(false);

    try {
      const res = await fetch('/api/admin/salesforce/sync', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed with status ${res.status}`);
      }
      const data = await res.json();
      setSyncResult(data.result ?? data);
      setCredentials(data.credentials ?? null);
      queryClient.invalidateQueries({ queryKey: ['salesforce-sync-history'] });
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Salesforce Sync</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Sync SOM participants and parents from Salesforce
        </p>
      </div>

      {/* Sync Controls */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {!showConfirm ? (
            <Button
              size="lg"
              variant="primary"
              disabled={syncing}
              loading={syncing}
              onClick={() => setShowConfirm(true)}
              className="min-w-[220px]"
            >
              {syncing ? (
                'Syncing...'
              ) : (
                <>
                  <CloudDownload className="h-5 w-5" />
                  Sync from Salesforce
                </>
              )}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-brand-dark-text">
                This will sync SOM participants and parents from Salesforce. New
                accounts will be created for contacts with email addresses.
                Continue?
              </p>
              <div className="flex gap-3">
                <Button variant="primary" onClick={handleSync}>
                  Yes, Sync Now
                </Button>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Error */}
      {syncError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Sync Failed</p>
              <p className="mt-1 text-sm text-red-700">{syncError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Results */}
      {syncResult && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <CardTitle>Sync Results</CardTitle>
              </div>
              <CardDescription>
                Processed {syncResult.totalProcessed} records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                  label="Participants Created"
                  value={syncResult.participantsCreated}
                  icon={UserPlus}
                  color="text-emerald-700"
                  bg="bg-emerald-50"
                />
                <StatCard
                  label="Participants Updated"
                  value={syncResult.participantsUpdated}
                  icon={UserCheck}
                  color="text-blue-700"
                  bg="bg-blue-50"
                />
                <StatCard
                  label="Participants Skipped"
                  value={syncResult.participantsSkipped}
                  icon={UserX}
                  color="text-amber-700"
                  bg="bg-amber-50"
                />
                <StatCard
                  label="Parents Created"
                  value={syncResult.parentsCreated}
                  icon={UserPlus}
                  color="text-emerald-700"
                  bg="bg-emerald-50"
                />
                <StatCard
                  label="Parents Updated"
                  value={syncResult.parentsUpdated}
                  icon={UserCheck}
                  color="text-blue-700"
                  bg="bg-blue-50"
                />
                <StatCard
                  label="Parents Skipped"
                  value={syncResult.parentsSkipped}
                  icon={UserX}
                  color="text-amber-700"
                  bg="bg-amber-50"
                />
                <StatCard
                  label="Relationships Created"
                  value={syncResult.relationshipsCreated}
                  icon={Link2}
                  color="text-purple-700"
                  bg="bg-purple-50"
                />
                <StatCard
                  label="Errors"
                  value={syncResult.errors.length}
                  icon={XCircle}
                  color="text-red-700"
                  bg="bg-red-50"
                />
              </div>

              {/* Download Credentials CSV */}
              {credentials && credentials.length > 0 && (
                <div className="mt-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-800">
                      {credentials.length} new account{credentials.length !== 1 ? 's' : ''} created
                    </p>
                    <p className="text-xs text-emerald-700">
                      Download the credentials CSV to share temporary passwords
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadCredentialsCsv(credentials)}
                    className="flex-shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missing Emails */}
          {syncResult.missingEmails && syncResult.missingEmails.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">Missing Emails</Badge>
                  <CardTitle className="text-base">
                    Participants Without Email
                  </CardTitle>
                </div>
                <CardDescription>
                  These participants don&apos;t have email in Salesforce and need
                  emails added manually:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          Name
                        </th>
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          Grade
                        </th>
                        <th className="pb-2 pr-4 font-medium text-brand-muted">
                          School
                        </th>
                        <th className="pb-2 font-medium text-brand-muted">
                          Salesforce ID
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {syncResult.missingEmails.map((m) => (
                        <tr key={m.salesforceId}>
                          <td className="py-2 pr-4 text-brand-dark-text">
                            {m.name}
                          </td>
                          <td className="py-2 pr-4 text-brand-muted">
                            {m.grade ?? '--'}
                          </td>
                          <td className="py-2 pr-4 text-brand-muted">
                            {m.school ?? '--'}
                          </td>
                          <td className="py-2 font-mono text-xs text-brand-muted">
                            {m.salesforceId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Details */}
          {syncResult.errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setErrorsExpanded(!errorsExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base">
                      Error Details ({syncResult.errors.length})
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
                    {syncResult.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm"
                      >
                        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-red-800">
                            {err.contactName}
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
        </>
      )}

      {/* Sync History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sync History</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ['salesforce-sync-history'],
                })
              }
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-muted">
              No sync history yet. Run your first sync above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 pr-4 font-medium text-brand-muted">
                      Date
                    </th>
                    <th className="pb-2 pr-4 font-medium text-brand-muted">
                      Status
                    </th>
                    <th className="pb-2 pr-4 font-medium text-brand-muted text-right">
                      Synced
                    </th>
                    <th className="pb-2 pr-4 font-medium text-brand-muted text-right">
                      Created
                    </th>
                    <th className="pb-2 pr-4 font-medium text-brand-muted text-right">
                      Updated
                    </th>
                    <th className="pb-2 pr-4 font-medium text-brand-muted text-right">
                      Errors
                    </th>
                    <th className="pb-2 font-medium text-brand-muted text-right">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.slice(0, 20).map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 pr-4 text-brand-dark-text whitespace-nowrap">
                        {formatDate(entry.started_at)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {entry.records_synced}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-600">
                        {entry.created}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-blue-600">
                        {entry.updated}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-red-600">
                        {entry.errors}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-brand-muted">
                        {formatDuration(entry.duration_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
