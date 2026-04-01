'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  Filter,
  Loader2,
  AlertTriangle,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Calendar,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface GroupOption {
  id: string;
  name: string;
  slug: string;
  area: string;
}

interface ParticipantHours {
  id: string;
  firstName: string;
  lastName: string;
  isDropout: boolean;
  saturdaySessions: number;
  weekdaySessions: number;
  eventHours: number;
  totalHours: number;
}

interface HoursBreakdown {
  regularSaturdays: { count: number; hoursEach: number; total: number };
  regularWeekdays: { count: number; hoursEach: number; total: number; dayName: string };
  events: { name: string; date: string; hours: number }[];
  eventTotal: number;
  grandTotal: number;
}

interface DetailResponse {
  participant: { id: string; first_name: string; last_name: string };
  group: { name: string; slug: string };
  breakdown: HoursBreakdown;
}

export default function AdminHoursPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'hours'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Fetch leadership groups
  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['hours-groups'],
    queryFn: async () => {
      const res = await fetch('/api/admin/hours');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const groups = groupsData?.groups ?? [];
  const effectiveGroupId = selectedGroupId ?? groups[0]?.id ?? null;

  // Fetch hours for selected group
  const { data: hoursData, isLoading, error } = useQuery<{
    group: { name: string; slug: string };
    rates: { saturday: number; weekday: number };
    weekdayName: string;
    participants: ParticipantHours[];
  }>({
    queryKey: ['hours-data', effectiveGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/hours?group_id=${effectiveGroupId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!effectiveGroupId,
  });

  const participants = hoursData?.participants ?? [];
  const rates = hoursData?.rates;
  const weekdayName = hoursData?.weekdayName ?? 'Weekday';
  const groupName = hoursData?.group?.name ?? '';
  const groupSlug = hoursData?.group?.slug ?? '';

  // Sort participants
  const sorted = useMemo(() => {
    const active = participants.filter(p => !p.isDropout);
    const sorted = [...active];
    sorted.sort((a, b) => {
      if (sortBy === 'name') {
        const cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? a.totalHours - b.totalHours : b.totalHours - a.totalHours;
    });
    return sorted;
  }, [participants, sortBy, sortAsc]);

  const avgHours = sorted.length > 0
    ? Math.round(sorted.reduce((s, p) => s + p.totalHours, 0) / sorted.length)
    : 0;
  const maxHours = sorted.length > 0 ? Math.max(...sorted.map(p => p.totalHours)) : 0;

  function toggleSort(field: 'name' | 'hours') {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(field === 'name'); }
  }

  // Generate PDF letter for a single participant
  const generateLetter = useCallback(async (participantId: string) => {
    setGeneratingId(participantId);
    try {
      const res = await fetch(`/api/admin/hours?group_id=${effectiveGroupId}&participant_id=${participantId}`);
      if (!res.ok) throw new Error('Failed to get data');
      const data: DetailResponse = await res.json();

      // Open in new window for printing
      const html = buildLetterHTML(data);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      alert('Error generating letter: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setGeneratingId(null);
    }
  }, [effectiveGroupId]);

  // Generate ALL letters
  const generateAllLetters = useCallback(async () => {
    setGeneratingAll(true);
    try {
      // Fetch details for ALL active participants
      const allDetails: DetailResponse[] = [];
      for (const p of sorted) {
        const res = await fetch(`/api/admin/hours?group_id=${effectiveGroupId}&participant_id=${p.id}`);
        if (res.ok) {
          const data: DetailResponse = await res.json();
          allDetails.push(data);
        }
      }

      const html = buildAllLettersHTML(allDetails);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setGeneratingAll(false);
    }
  }, [sorted, effectiveGroupId]);

  function getProgramLabel(slug: string) {
    if (slug === 'som') return 'School of Madrichim';
    if (slug === 'pre-som') return 'Pre-School of Madrichim';
    if (slug.startsWith('madrichim-')) return 'Maccabi Tzair Madrichim Program';
    if (slug === 'mazkirut') return 'Maccabi Tzair Mazkirut Program';
    return 'Maccabi Tzair';
  }

  function getCoordinatorInfo(slug: string) {
    if (slug === 'som') return { name: 'Ariel Hutnik', title: 'Coordinator of School of Madrichim', email: 'arih@marjcc.org', ext: '394', signature: 'signature-som.png' };
    if (slug === 'pre-som') return { name: 'Mercedes Ben Moha', title: 'Coordinator of Pre School of Madrichim', email: 'mbenmoha@marjcc.org', ext: '233', signature: null };
    return { name: 'Ariel Hutnik', title: 'Director of Maccabi Tzair', email: 'arih@marjcc.org', ext: '394', signature: 'signature-ariel.png' };
  }

  function buildLetterHTML(data: DetailResponse): string {
    const { participant, group, breakdown } = data;
    const fullName = `${participant.first_name} ${participant.last_name}`;
    const program = getProgramLabel(group.slug);
    const coord = getCoordinatorInfo(group.slug);
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const letterheadUrl = window.location.origin + '/csh-assets/letterhead.png';

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
      JCC in North Miami Beach. As the ${coord.title} at the MAR-JCC, I
      have had the pleasure of witnessing <strong>${fullName}</strong>'s commitment and growth within our
      program.
    </p>

    <p class="body-text">
      Our mission is to foster Jewish identity by developing young leaders and role models for
      the children in our community. In this capacity, <strong>${fullName}</strong> has truly flourished.
    </p>

    <p class="body-text">
      From 2025 to 2026, while participating in the ${program} leadership training
      program, <strong>${fullName}</strong> volunteered a total of <strong>${breakdown.grandTotal} hours</strong>, distributed as follows:
    </p>

    <div class="breakdown">
      ${breakdown.regularSaturdays.count > 0 ? `• <strong>${breakdown.regularSaturdays.count}</strong> Saturday sessions × ${breakdown.regularSaturdays.hoursEach}h = <strong>${breakdown.regularSaturdays.total} hours</strong><br>` : ''}
      ${breakdown.regularWeekdays.count > 0 ? `• <strong>${breakdown.regularWeekdays.count}</strong> ${breakdown.regularWeekdays.dayName} sessions × ${breakdown.regularWeekdays.hoursEach}h = <strong>${breakdown.regularWeekdays.total} hours</strong><br>` : ''}
      ${breakdown.events.map(e => `• ${e.name}: <strong>${e.hours} hours</strong>`).join('<br>')}
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
      ${coord.signature ? `<img src="${window.location.origin}/csh-assets/${coord.signature}" class="sig-image" alt="Signature">` : ''}
      <div class="sig-name">${coord.name}</div>
      <div class="sig-title">${coord.title}</div>
      <div class="sig-title">Email: ${coord.email}</div>
      <div class="sig-title">Phone: 305-932-4200. Ext: ${coord.ext}</div>
    </div>
  </div>
</div>
</body>
</html>`;
  }

  function buildAllLettersHTML(allData: DetailResponse[]): string {
    const pages = allData.map(d => {
      const single = buildLetterHTML(d);
      // Extract just the page div
      const match = single.match(/<div class="page">[\s\S]*?<\/div>\s*<\/body>/);
      return match ? match[0].replace('</body>', '') : '';
    });

    const first = buildLetterHTML(allData[0]);
    const headEnd = first.indexOf('</head>');
    const head = first.substring(0, headEnd + 7);

    return `${head}<body>${pages.join('\n')}</body></html>`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Community Service Hours</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Calculate hours and generate official letters for participants.
          </p>
        </div>
        {sorted.length > 0 && (
          <Button onClick={generateAllLetters} disabled={generatingAll}>
            {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Generate All Letters
          </Button>
        )}
      </div>

      {/* Group selector */}
      <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-100 flex-wrap">
        <Filter className="ml-2 h-4 w-4 text-brand-muted" />
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGroupId(g.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              effectiveGroupId === g.id
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-dark-text hover:bg-gray-50'
            )}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!isLoading && !error && effectiveGroupId && sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 text-brand-navy" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{sorted.length}</p>
                <p className="text-xs text-brand-muted">Participants</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">
                  {rates?.saturday}h Sat / {rates?.weekday}h {weekdayName.substring(0, 3)}
                </p>
                <p className="text-xs text-brand-muted">Rate per session</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Star className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold text-brand-dark-text">{avgHours}h</p>
                <p className="text-xs text-brand-muted">Average hours</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Star className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold text-emerald-600">{maxHours}h</p>
                <p className="text-xs text-brand-muted">Highest hours</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'Error'}</p>
          </CardContent>
        </Card>
      )}

      {/* Participants list */}
      {!isLoading && !error && sorted.length > 0 && (
        <Card>
          <CardContent className="py-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th
                    className="py-3 pl-4 text-left font-semibold text-brand-dark-text cursor-pointer hover:text-brand-navy select-none"
                    onClick={() => toggleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name
                      {sortBy === 'name' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </span>
                  </th>
                  <th className="py-3 text-center font-semibold text-brand-muted">Sat</th>
                  <th className="py-3 text-center font-semibold text-brand-muted">{weekdayName.substring(0, 3)}</th>
                  <th className="py-3 text-center font-semibold text-brand-muted">Events</th>
                  <th
                    className="py-3 text-center font-semibold text-brand-dark-text cursor-pointer hover:text-brand-navy select-none"
                    onClick={() => toggleSort('hours')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Total Hours
                      {sortBy === 'hours' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </span>
                  </th>
                  <th className="py-3 pr-4 text-right font-semibold text-brand-muted">Letter</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2.5 pl-4 font-medium text-brand-dark-text">
                      {p.lastName}, {p.firstName}
                    </td>
                    <td className="py-2.5 text-center text-brand-muted">
                      {p.saturdaySessions > 0 && (
                        <span>{p.saturdaySessions} <span className="text-[10px]">({p.saturdaySessions * rates!.saturday}h)</span></span>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-brand-muted">
                      {p.weekdaySessions > 0 && (
                        <span>{p.weekdaySessions} <span className="text-[10px]">({p.weekdaySessions * rates!.weekday}h)</span></span>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-brand-muted">
                      {p.eventHours > 0 && (
                        <Badge className="bg-purple-50 text-purple-700">{p.eventHours}h</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs font-bold',
                        p.totalHours >= 100 ? 'bg-emerald-100 text-emerald-700' :
                        p.totalHours >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      )}>
                        {p.totalHours}h
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateLetter(p.id)}
                        disabled={generatingId === p.id}
                        className="cursor-pointer"
                      >
                        {generatingId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
