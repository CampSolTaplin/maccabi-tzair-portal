'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, Star, Loader2, FileText } from 'lucide-react';

interface HoursResponse {
  profile: {
    first_name: string;
    last_name: string;
    role: 'madrich' | 'mazkirut';
  };
  groups: Array<{
    id: string;
    name: string;
    slug: string;
    area: string | null;
    sessions: number;
    hours: number;
  }>;
  breakdown: {
    saturdays: { count: number; hours: number };
    weekdays: { count: number; hours: number };
    lateSessions: { count: number; hours: number };
    grandTotal: number;
  };
}

export default function MyHoursPage() {
  const { data, isLoading, error } = useQuery<HoursResponse>({
    queryKey: ['my-hours'],
    queryFn: async () => {
      const res = await fetch('/api/madrich/my-hours');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load hours');
      }
      return res.json();
    },
  });

  function handlePrintLetter() {
    if (!data) return;
    const html = buildLetterHTML(data);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Clock className="h-12 w-12 text-brand-muted/40 mx-auto" />
        <p className="mt-4 text-sm text-brand-muted">
          {error instanceof Error ? error.message : 'Failed to load hours.'}
        </p>
      </div>
    );
  }

  const { profile, groups, breakdown } = data;
  const fullName = `${profile.first_name} ${profile.last_name}`;
  const activeGroups = groups.filter((g) => g.sessions > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md">
        <div className="flex items-center gap-3 mb-1">
          <Clock className="h-7 w-7" />
          <h1 className="text-2xl font-bold">My Community Hours</h1>
        </div>
        <p className="text-white/80">{fullName}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <Star className="h-6 w-6 text-amber-500" />
            <div>
              <p className="text-3xl font-bold text-brand-dark-text">
                {breakdown.grandTotal}
              </p>
              <p className="text-xs text-brand-muted">Total hours</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <Calendar className="h-6 w-6 text-blue-500" />
            <div>
              <p className="text-3xl font-bold text-brand-dark-text">
                {breakdown.saturdays.count}
              </p>
              <p className="text-xs text-brand-muted">
                Saturday sessions ({breakdown.saturdays.hours}h)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <Calendar className="h-6 w-6 text-emerald-500" />
            <div>
              <p className="text-3xl font-bold text-brand-dark-text">
                {breakdown.weekdays.count}
              </p>
              <p className="text-xs text-brand-muted">
                Weekday sessions ({breakdown.weekdays.hours}h)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {breakdown.lateSessions.count > 0 && (
        <Card>
          <CardContent className="py-3 text-sm text-brand-muted">
            Includes {breakdown.lateSessions.count} late arrival(s) —{' '}
            <span className="font-medium text-brand-dark-text">
              {breakdown.lateSessions.hours}h
            </span>{' '}
            counted at the late rate.
          </CardContent>
        </Card>
      )}

      {/* Per-group breakdown */}
      {activeGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">
            By group
          </h3>
          <div className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
            {activeGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium text-brand-dark-text">{g.name}</p>
                  {g.area && (
                    <p className="text-xs text-brand-muted uppercase tracking-wider mt-0.5">
                      {g.area}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-brand-dark-text">{g.hours}h</p>
                  <p className="text-xs text-brand-muted">
                    {g.sessions} session{g.sessions === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Download letter */}
      {breakdown.grandTotal > 0 && (
        <div className="flex justify-end">
          <Button onClick={handlePrintLetter}>
            <FileText className="h-4 w-4" />
            Download my letter
          </Button>
        </div>
      )}

      {breakdown.grandTotal === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-10 w-10 text-brand-muted/40" />
            <p className="mt-3 text-sm text-brand-muted">
              No community hours recorded yet.
            </p>
            <p className="text-xs text-brand-muted mt-1">
              Your coordinator will mark your attendance during the season.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Builds the printable letter HTML for the current user. Mirrors the
 * format of /admin/hours but targets a single madrich / mazkirut. The
 * coordinator signer is hardcoded to the same director info the
 * participant letters use.
 */
function buildLetterHTML(data: HoursResponse): string {
  const { profile, breakdown } = data;
  const fullName = `${profile.first_name} ${profile.last_name}`;
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const letterheadUrl = window.location.origin + '/csh-assets/letterhead.png';
  const sigUrl = window.location.origin + '/csh-assets/signature-ariel.png';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Community Service Hours - ${fullName}</title>
<style>
  @page { size: letter; margin: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 10.5pt; color: #333; margin: 0; padding: 0; }
  .page {
    width: 8.5in;
    height: 11in;
    position: relative;
    box-sizing: border-box;
    page-break-after: always;
    background-image: url('${letterheadUrl}');
    background-size: 8.5in 11in;
    background-position: top left;
    background-repeat: no-repeat;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .content {
    position: absolute;
    top: 0.65in;
    left: 1.65in;
    right: 0.6in;
    bottom: 0.9in;
  }
  .date { font-size: 10.5pt; margin-bottom: 0.25in; }
  .ref { font-size: 10.5pt; margin-bottom: 0.2in; }
  .greeting { font-size: 10.5pt; margin-bottom: 0.15in; }
  .body-text { font-size: 10pt; line-height: 1.55; margin-bottom: 0.12in; text-align: justify; }
  .body-text strong { font-weight: bold; }
  .breakdown { font-size: 10pt; line-height: 1.55; margin-bottom: 0.12in; padding-left: 0.25in; }
  .breakdown strong { font-weight: bold; }
  .closing { margin-top: 0.2in; font-size: 10.5pt; }
  .signature { margin-top: 0.12in; }
  .sig-image { height: 50px; margin-bottom: 2px; }
  .sig-name { font-weight: bold; font-size: 10.5pt; }
  .sig-title { font-size: 9pt; color: #555; }
  @media print {
    body { margin: 0; }
    .page { page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="content">
    <div class="date">${today}</div>
    <div class="ref">REF: <strong>${fullName}</strong></div>
    <div class="greeting">To Whom It May Concern,</div>

    <p class="body-text">
      I am writing on behalf of <strong>${fullName}</strong>, a dedicated volunteer at the Michael-Ann Russell
      JCC in North Miami Beach. As the Director of Maccabi Tzair at the MAR-JCC, I have had the
      pleasure of witnessing <strong>${fullName}</strong>'s commitment and growth within our program.
    </p>

    <p class="body-text">
      Our mission is to foster Jewish identity by developing young leaders and role models for
      the children in our community. In this capacity, <strong>${fullName}</strong> has truly flourished.
    </p>

    <p class="body-text">
      From 2025 to 2026, while serving as a ${profile.role} in the Maccabi Tzair program,
      <strong>${fullName}</strong> volunteered a total of <strong>${breakdown.grandTotal} hours</strong>, distributed as follows:
    </p>

    <div class="breakdown">
      ${breakdown.saturdays.count > 0 ? `• <strong>${breakdown.saturdays.count}</strong> Saturday sessions = <strong>${breakdown.saturdays.hours} hours</strong><br>` : ''}
      ${breakdown.weekdays.count > 0 ? `• <strong>${breakdown.weekdays.count}</strong> Weekday sessions = <strong>${breakdown.weekdays.hours} hours</strong><br>` : ''}
      ${breakdown.lateSessions.count > 0 ? `• <strong>${breakdown.lateSessions.count}</strong> Late arrivals = <strong>${breakdown.lateSessions.hours} hours</strong>` : ''}
    </div>

    <p class="body-text">
      We are incredibly fortunate to have <strong>${fullName}</strong> in our program. However, the true
      beneficiaries are the children and the broader community, who gain so much from
      Hebraica's programs—programs that would not be possible without the dedication of
      volunteers.
    </p>

    <p class="body-text">
      Should you require any additional information, please do not hesitate to contact me.
    </p>

    <div class="closing">Sincerely,</div>
    <div class="signature">
      <img src="${sigUrl}" class="sig-image" alt="Signature">
      <div class="sig-name">Ariel Hutnik</div>
      <div class="sig-title">Director of Maccabi Tzair</div>
      <div class="sig-title">Email: arih@marjcc.org</div>
      <div class="sig-title">Phone: 305-932-4200. Ext: 394</div>
    </div>
  </div>
</div>
</body>
</html>`;
}
