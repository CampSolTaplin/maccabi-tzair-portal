'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
  UserCheck,
  GraduationCap,
  HeartPulse,
  Info,
} from 'lucide-react';

/* ── Types ── */

interface EnrichResult {
  totalProfiles: number;
  enrichedFromSF: number;
  parentsFound: number;
  schoolsNormalized: number;
  allergiesCleaned: number;
  errors: { contactId: string; name: string; error: string }[];
}

/* ── Summary Card ── */

function SummaryCard({
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

/* ── Main Page ── */

export default function SalesforceEnrichPage() {
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const handleEnrich = useCallback(async () => {
    setShowConfirm(false);
    setEnriching(true);
    setEnrichResult(null);
    setEnrichError(null);
    setErrorsExpanded(false);

    try {
      const res = await fetch('/api/admin/salesforce/sync', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Enrich failed with status ${res.status}`);
      }
      const data = await res.json();
      setEnrichResult(data.result);
    } catch (err: unknown) {
      setEnrichError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setEnriching(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">
          Salesforce Data Enrichment
        </h2>
        <p className="mt-1 text-sm text-brand-muted">
          Update participant profiles with the latest data from Salesforce
        </p>
      </div>

      {/* Enrich Button */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {!showConfirm ? (
            <Button
              size="lg"
              variant="primary"
              disabled={enriching}
              loading={enriching}
              onClick={() => setShowConfirm(true)}
              className="min-w-[240px]"
            >
              {enriching ? (
                'Enriching...'
              ) : (
                <>
                  <RefreshCw className="h-5 w-5" />
                  Enrich from Salesforce
                </>
              )}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center max-w-lg">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-brand-dark-text">
                This will update all participant profiles with fresh data from
                Salesforce (gender, school, allergies, parent details). No new
                profiles will be created. Continue?
              </p>
              <div className="flex gap-3">
                <Button variant="primary" onClick={handleEnrich}>
                  Yes, Enrich Now
                </Button>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrich Error */}
      {enrichError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Enrichment Failed</p>
              <p className="mt-1 text-sm text-red-700">{enrichError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enrich Results */}
      {enrichResult && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <CardTitle>Enrichment Results</CardTitle>
              </div>
              <CardDescription>
                Processed {enrichResult.totalProfiles} profiles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <SummaryCard
                  label="Profiles Enriched"
                  value={enrichResult.enrichedFromSF}
                  icon={UserCheck}
                  color="text-emerald-700"
                  bg="bg-emerald-50"
                />
                <SummaryCard
                  label="Parents Found"
                  value={enrichResult.parentsFound}
                  icon={Users}
                  color="text-blue-700"
                  bg="bg-blue-50"
                />
                <SummaryCard
                  label="Schools Normalized"
                  value={enrichResult.schoolsNormalized}
                  icon={GraduationCap}
                  color="text-purple-700"
                  bg="bg-purple-50"
                />
                <SummaryCard
                  label="Allergies Cleaned"
                  value={enrichResult.allergiesCleaned}
                  icon={HeartPulse}
                  color="text-amber-700"
                  bg="bg-amber-50"
                />
                <SummaryCard
                  label="Errors"
                  value={enrichResult.errors.length}
                  icon={XCircle}
                  color="text-red-700"
                  bg="bg-red-50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Error Details */}
          {enrichResult.errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setErrorsExpanded(!errorsExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base">
                      Error Details ({enrichResult.errors.length})
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
                    {enrichResult.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm"
                      >
                        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-red-800">
                            {err.name}{' '}
                            <span className="font-mono text-xs text-red-500">
                              ({err.contactId})
                            </span>
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

      {/* What Gets Updated */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-brand-navy" />
            <CardTitle>What Gets Updated</CardTitle>
          </div>
          <CardDescription>
            The enrichment process updates existing profiles with fresh
            Salesforce data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-medium text-brand-dark-text">Updated fields</p>
              <ul className="space-y-1 text-brand-muted">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  Gender from Salesforce
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  Father name, email, phone (from family Account)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  Mother name, email, phone (from family Account)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  School name normalization
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  Allergy cleanup (removes &quot;No&quot;, &quot;N/A&quot;, etc.)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  Removes &quot;.invalid&quot; from emails
                </li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-brand-dark-text">Not affected</p>
              <ul className="space-y-1 text-brand-muted">
                <li className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  Does NOT create new profiles
                </li>
                <li className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  Does NOT modify group memberships
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
