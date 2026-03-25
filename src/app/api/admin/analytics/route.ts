import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

/* ─── Group mapping ─── */

const GROUP_DISPLAY: Record<string, string> = {
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

const SKIP_KEYWORDS = ['trip', 'seminar', 'sleepover', 'machane', 'retreat', 'shabbaton', 'camping', 'camp ', 'late night', 'deposit', 'extra fee', 'waitlist', 'non-refundable'];

function mapCourseToGroup(courseOptionName: string): { slug: string; name: string } | null {
  if (!courseOptionName) return null;
  const lower = courseOptionName.toLowerCase();
  for (const kw of SKIP_KEYWORDS) {
    if (lower.includes(kw)) return null;
  }
  if (lower.includes('kindergarten') || lower.includes('kinder')) return { slug: 'katan-kinder', name: 'Kinder' };
  if (lower.includes('1st grade')) return { slug: 'katan-1st', name: '1st Grade' };
  if (lower.includes('2nd grade')) return { slug: 'katan-2nd', name: '2nd Grade' };
  if (lower.includes('3rd grade')) return { slug: 'katan-3rd', name: '3rd Grade' };
  if (lower.includes('4th grade')) return { slug: 'katan-4th', name: '4th Grade' };
  if (lower.includes('5th grade')) return { slug: 'katan-5th', name: '5th Grade' };
  if (lower.includes('6th grade') || lower.includes('noar 6th')) return { slug: 'noar-6th', name: '6th Grade' };
  if (lower.includes('7th grade') || lower.includes('noar 7th')) return { slug: 'noar-7th', name: '7th Grade' };
  if (lower.includes('8th grade') || lower.includes('noar 8th')) return { slug: 'noar-8th', name: '8th Grade' };
  if (lower.includes('pre-som') || lower.includes('pre school of madrichim')) return { slug: 'pre-som', name: 'Pre-SOM' };
  if (lower.includes('som') || lower.includes('school of madrichim')) return { slug: 'som', name: 'SOM' };
  return null;
}

function normalizeSfId(id: string | null | undefined): string {
  if (!id) return '';
  return id.substring(0, 15);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows<T>(queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

interface SnapshotParticipant {
  name: string;
  contactId: string;
  groupSlug: string;
  groupName: string;
  gender: string;
  grade: string;
}

/* ─── GET: list saved snapshots ─── */
export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('analytics_snapshots')
      .select('id, year_label, total_count, uploaded_at')
      .order('year_label', { ascending: false });
    if (error) throw error;

    // Also add current year as a virtual snapshot
    const currentProfiles = await fetchAllRows<{ id: string; salesforce_contact_id: string | null }>((from, to) =>
      db.from('profiles').select('id, salesforce_contact_id').eq('role', 'participant').eq('is_active', true).range(from, to)
    );

    return NextResponse.json({
      snapshots: data ?? [],
      currentYear: { year_label: '2025-2026', total_count: currentProfiles.length },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load snapshots' }, { status: 500 });
  }
}

/* ─── POST: upload XLSX and save as snapshot ─── */
export async function POST(request: NextRequest) {
  try {
    const db = createAdminClient();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const yearLabel = formData.get('year_label') as string | null;

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (!yearLabel) return NextResponse.json({ error: 'year_label is required' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const dataRows = rows.slice(1).filter((r) => r && r.length > 0);

    // Extract unique participants
    const byContact = new Map<string, { row: unknown[]; groups: { slug: string; name: string }[] }>();
    for (const row of dataRows) {
      const contactId = String(row[16] ?? '').trim();
      if (!contactId) continue;
      const nid = normalizeSfId(contactId);
      const group = mapCourseToGroup(String(row[20] ?? ''));
      if (!byContact.has(nid)) byContact.set(nid, { row, groups: [] });
      if (group) byContact.get(nid)!.groups.push(group);
    }

    const participants: SnapshotParticipant[] = [];
    for (const [nid, { row, groups }] of byContact) {
      const group = groups[0];
      if (!group) continue;
      participants.push({
        name: String(row[0] ?? '').trim(),
        contactId: nid,
        groupSlug: group.slug,
        groupName: group.name,
        gender: String(row[1] ?? '').trim(),
        grade: String(row[5] ?? '').trim(),
      });
    }

    // Save to DB (upsert by year_label)
    const { error } = await db.from('analytics_snapshots').upsert({
      year_label: yearLabel,
      participants: JSON.stringify(participants),
      total_count: participants.length,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: 'year_label' });

    if (error) throw error;

    return NextResponse.json({ saved: true, year_label: yearLabel, total: participants.length });
  } catch (err) {
    console.error('Analytics upload error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
  }
}

/* ─── PATCH: compare two years ─── */
export async function PATCH(request: NextRequest) {
  try {
    const db = createAdminClient();
    const { yearA, yearB } = await request.json();

    if (!yearA || !yearB) {
      return NextResponse.json({ error: 'yearA and yearB required' }, { status: 400 });
    }

    const allSlugs = Object.keys(GROUP_DISPLAY);

    // Load year A data
    let yearAParticipants: SnapshotParticipant[];
    let yearALabel = yearA;

    if (yearA === '2025-2026') {
      // Current year from DB
      yearAParticipants = await loadCurrentYear(db);
    } else {
      const { data, error } = await db.from('analytics_snapshots').select('participants').eq('year_label', yearA).single();
      if (error || !data) return NextResponse.json({ error: `Snapshot ${yearA} not found` }, { status: 404 });
      yearAParticipants = typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants;
    }

    // Load year B data
    let yearBParticipants: SnapshotParticipant[];

    if (yearB === '2025-2026') {
      yearBParticipants = await loadCurrentYear(db);
    } else {
      const { data, error } = await db.from('analytics_snapshots').select('participants').eq('year_label', yearB).single();
      if (error || !data) return NextResponse.json({ error: `Snapshot ${yearB} not found` }, { status: 404 });
      yearBParticipants = typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants;
    }

    // Build maps
    const mapA = new Map<string, SnapshotParticipant>();
    for (const p of yearAParticipants) mapA.set(p.contactId, p);

    const mapB = new Map<string, SnapshotParticipant>();
    for (const p of yearBParticipants) mapB.set(p.contactId, p);

    // Compute retention with business rules:
    // - SOM participants from year A who are not in year B → "graduated", NOT "lost"
    // - Kinder participants in year B who are not in year A → expected entry, NOT "new"
    const returned = new Set<string>();
    const lost = new Set<string>();
    const graduated = new Set<string>();
    const newP = new Set<string>();
    const expectedEntry = new Set<string>();

    for (const nid of mapA.keys()) {
      if (mapB.has(nid)) {
        returned.add(nid);
      } else {
        const pA = mapA.get(nid)!;
        if (pA.groupSlug === 'som') {
          graduated.add(nid); // SOM → graduated, not lost
        } else {
          lost.add(nid);
        }
      }
    }
    for (const nid of mapB.keys()) {
      if (!mapA.has(nid)) {
        const pB = mapB.get(nid)!;
        if (pB.groupSlug === 'katan-kinder') {
          expectedEntry.add(nid); // Kinder → expected entry, not truly "new"
        } else {
          newP.add(nid);
        }
      }
    }

    // Per-group stats
    const groupStats = allSlugs.map((slug) => {
      const aCount = yearAParticipants.filter((p) => p.groupSlug === slug).length;
      const bCount = yearBParticipants.filter((p) => p.groupSlug === slug).length;
      const retInGroup = [...returned].filter((nid) => mapA.get(nid)?.groupSlug === slug).length;
      const gradInGroup = [...graduated].filter((nid) => mapA.get(nid)?.groupSlug === slug).length;
      const lostInGroup = aCount - retInGroup - gradInGroup;
      return {
        slug,
        name: GROUP_DISPLAY[slug],
        yearA: aCount,
        yearB: bCount,
        returned: retInGroup,
        graduated: gradInGroup,
        new: bCount - retInGroup,
        lost: lostInGroup > 0 ? lostInGroup : 0,
        retentionPct: aCount > 0 ? Math.round((retInGroup / aCount) * 100) : 0,
      };
    });

    // Lost participants (excluding SOM graduates)
    const lostList = [...lost].map((nid) => {
      const p = mapA.get(nid)!;
      return { name: p.name, group: GROUP_DISPLAY[p.groupSlug] ?? p.groupSlug, grade: p.grade, contactId: p.contactId };
    });

    // Returned with transitions
    const returnedList = [...returned].map((nid) => {
      const a = mapA.get(nid)!;
      const b = mapB.get(nid)!;
      return {
        name: b.name,
        lastYearGroup: GROUP_DISPLAY[a.groupSlug] ?? a.groupSlug,
        thisYearGroup: GROUP_DISPLAY[b.groupSlug] ?? b.groupSlug,
        transitioned: a.groupSlug !== b.groupSlug,
      };
    });

    const totalA = mapA.size;
    const totalB = mapB.size;
    // For retention rate, exclude SOM graduates from the denominator (they completed the program)
    const retentionBase = totalA - graduated.size;
    const retentionRate = retentionBase > 0 ? Math.round((returned.size / retentionBase) * 100) : 0;

    // Graduated participants list
    const graduatedList = [...graduated].map((nid) => {
      const p = mapA.get(nid)!;
      return { name: p.name, group: GROUP_DISPLAY[p.groupSlug] ?? p.groupSlug };
    });

    return NextResponse.json({
      summary: {
        yearA: { label: yearA, total: totalA },
        yearB: { label: yearB, total: totalB },
        returned: returned.size,
        new: newP.size,
        lost: lost.size,
        graduated: graduated.size,
        expectedEntry: expectedEntry.size,
        retentionRate,
        growthRate: totalA > 0 ? Math.round(((totalB - totalA) / totalA) * 100) : 0,
      },
      byGroup: groupStats,
      lostParticipants: lostList,
      returnedParticipants: returnedList,
      graduatedParticipants: graduatedList,
    });
  } catch (err) {
    console.error('Analytics compare error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Compare failed' }, { status: 500 });
  }
}

/* ─── PUT: multi-year trend + cohort analysis ─── */
export async function PUT(request: NextRequest) {
  try {
    const db = createAdminClient();
    const { years } = await request.json() as { years: string[] };

    if (!years || years.length < 2) {
      return NextResponse.json({ error: 'At least 2 years required' }, { status: 400 });
    }

    const sortedYears = [...years].sort();

    // Load all snapshots
    const yearData = new Map<string, SnapshotParticipant[]>();
    for (const y of sortedYears) {
      if (y === '2025-2026') {
        yearData.set(y, await loadCurrentYear(db));
      } else {
        const { data, error } = await db.from('analytics_snapshots').select('participants').eq('year_label', y).single();
        if (error || !data) return NextResponse.json({ error: `Snapshot ${y} not found` }, { status: 404 });
        yearData.set(y, typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants);
      }
    }

    // 1. Total enrollment trend
    const enrollmentTrend = sortedYears.map((y) => ({ year: y, total: yearData.get(y)!.length }));

    // 2. Per-group trend across years
    const allSlugs = Object.keys(GROUP_DISPLAY);
    const groupTrend = allSlugs.map((slug) => ({
      slug,
      name: GROUP_DISPLAY[slug],
      counts: sortedYears.map((y) => ({
        year: y,
        count: yearData.get(y)!.filter((p) => p.groupSlug === slug).length,
      })),
    }));

    // 3. Year-over-year retention chain
    const retentionChain = [];
    for (let i = 0; i < sortedYears.length - 1; i++) {
      const yA = sortedYears[i];
      const yB = sortedYears[i + 1];
      const mapA = new Map<string, SnapshotParticipant>();
      for (const p of yearData.get(yA)!) mapA.set(p.contactId, p);
      const mapB = new Map<string, SnapshotParticipant>();
      for (const p of yearData.get(yB)!) mapB.set(p.contactId, p);

      let returned = 0, lost = 0, graduated = 0, newP = 0, expectedEntry = 0;
      for (const [nid, pA] of mapA) {
        if (mapB.has(nid)) returned++;
        else if (pA.groupSlug === 'som') graduated++;
        else lost++;
      }
      for (const [nid, pB] of mapB) {
        if (!mapA.has(nid)) {
          if (pB.groupSlug === 'katan-kinder') expectedEntry++;
          else newP++;
        }
      }
      const base = mapA.size - graduated;
      retentionChain.push({
        from: yA, to: yB,
        totalA: mapA.size, totalB: mapB.size,
        returned, lost, graduated, new: newP, expectedEntry,
        retentionPct: base > 0 ? Math.round((returned / base) * 100) : 0,
      });
    }

    // 4. Cohort tracking — follow natural group progression
    // The natural progression: Kinder→1st→2nd→3rd→4th→5th→6th→7th→8th→Pre-SOM→SOM→(graduated)
    const PROGRESSION: Record<string, string> = {
      'katan-kinder': 'katan-1st',
      'katan-1st': 'katan-2nd',
      'katan-2nd': 'katan-3rd',
      'katan-3rd': 'katan-4th',
      'katan-4th': 'katan-5th',
      'katan-5th': 'noar-6th',
      'noar-6th': 'noar-7th',
      'noar-7th': 'noar-8th',
      'noar-8th': 'pre-som',
      'pre-som': 'som',
      'som': 'graduated',
    };

    // For each pair of consecutive years, track cohort movement
    const cohorts = [];
    if (sortedYears.length >= 2) {
      const firstYear = sortedYears[0];
      const firstData = yearData.get(firstYear)!;

      // Group participants by their starting group in the first year
      const startingGroups = new Map<string, Set<string>>();
      for (const p of firstData) {
        if (!startingGroups.has(p.groupSlug)) startingGroups.set(p.groupSlug, new Set());
        startingGroups.get(p.groupSlug)!.add(p.contactId);
      }

      for (const [startSlug, contactIds] of startingGroups) {
        const cohort: { year: string; expectedGroup: string; expectedGroupName: string; total: number; inExpected: number; inOther: number; lost: number; graduated: number }[] = [];
        let currentExpected = startSlug;

        for (let i = 0; i < sortedYears.length; i++) {
          const y = sortedYears[i];
          const yData = yearData.get(y)!;
          const yMap = new Map<string, SnapshotParticipant>();
          for (const p of yData) yMap.set(p.contactId, p);

          let inExpected = 0, inOther = 0, lost = 0, grad = 0;
          for (const nid of contactIds) {
            const p = yMap.get(nid);
            if (!p) {
              if (currentExpected === 'graduated') grad++;
              else lost++;
            } else if (p.groupSlug === currentExpected) {
              inExpected++;
            } else {
              inOther++;
            }
          }

          cohort.push({
            year: y,
            expectedGroup: currentExpected,
            expectedGroupName: currentExpected === 'graduated' ? 'Graduated' : (GROUP_DISPLAY[currentExpected] ?? currentExpected),
            total: contactIds.size,
            inExpected,
            inOther,
            lost,
            graduated: grad,
          });

          // Advance to next expected group
          if (i < sortedYears.length - 1) {
            currentExpected = PROGRESSION[currentExpected] ?? 'graduated';
          }
        }

        // Calculate the current (last) year's expected group for this cohort
        const lastStep = cohort[cohort.length - 1];
        const currentGroupSlug = lastStep.expectedGroup;
        const currentGroupName = lastStep.expectedGroupName;

        cohorts.push({
          startGroup: GROUP_DISPLAY[startSlug] ?? startSlug,
          startGroupSlug: startSlug,
          currentGroup: currentGroupName,
          currentGroupSlug: currentGroupSlug,
          startYear: firstYear,
          size: contactIds.size,
          journey: cohort,
        });
      }
    }

    // Sort cohorts by current year's expected group order (Kinder→SOM→Graduated)
    const GROUP_ORDER = [
      'katan-kinder', 'katan-1st', 'katan-2nd', 'katan-3rd', 'katan-4th', 'katan-5th',
      'noar-6th', 'noar-7th', 'noar-8th', 'pre-som', 'som', 'graduated',
    ];

    return NextResponse.json({
      years: sortedYears,
      enrollmentTrend,
      groupTrend: groupTrend.filter((g) => g.counts.some((c) => c.count > 0)),
      retentionChain,
      cohorts: cohorts
        .filter((c) => c.size > 0)
        .sort((a, b) => GROUP_ORDER.indexOf(a.currentGroupSlug) - GROUP_ORDER.indexOf(b.currentGroupSlug)),
    });
  } catch (err) {
    console.error('Analytics trend error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Trend analysis failed' }, { status: 500 });
  }
}

/* ─── Load current year from DB (membership-driven, matches Groups tab) ─── */
async function loadCurrentYear(db: ReturnType<typeof createAdminClient>): Promise<SnapshotParticipant[]> {
  // Start from active memberships in program groups (same source as Groups tab)
  const { data: groups } = await db.from('groups').select('id, slug, name').eq('is_active', true);
  const groupById = new Map<string, { slug: string; name: string }>();
  const validGroupIds: string[] = [];
  for (const g of groups ?? []) {
    if (Object.keys(GROUP_DISPLAY).includes(g.slug)) {
      groupById.set(g.id, { slug: g.slug, name: g.name });
      validGroupIds.push(g.id);
    }
  }

  const memberships = await fetchAllRows<{ profile_id: string; group_id: string }>((from, to) =>
    db.from('group_memberships').select('profile_id, group_id')
      .eq('role', 'participant').eq('is_active', true)
      .in('group_id', validGroupIds)
      .range(from, to)
  );

  // Build membership map: profile_id → slug (first valid group)
  const memMap = new Map<string, string>();
  for (const m of memberships) {
    if (memMap.has(m.profile_id)) continue; // first group wins
    const g = groupById.get(m.group_id);
    if (g) memMap.set(m.profile_id, g.slug);
  }

  // Fetch ALL active participant profiles (simpler than .in() with 600+ IDs)
  const profiles = await fetchAllRows<{
    id: string; first_name: string; last_name: string; salesforce_contact_id: string | null; gender: string | null; grade: string | null;
  }>((from, to) =>
    db.from('profiles').select('id, first_name, last_name, salesforce_contact_id, gender, grade')
      .eq('is_active', true)
      .range(from, to)
  );

  const result: SnapshotParticipant[] = [];
  for (const p of profiles) {
    const slug = memMap.get(p.id);
    if (!slug) continue; // must have a valid program group membership
    const nid = normalizeSfId(p.salesforce_contact_id);
    if (!nid) continue;
    result.push({
      name: `${p.first_name} ${p.last_name}`,
      contactId: nid,
      groupSlug: slug,
      groupName: GROUP_DISPLAY[slug] ?? slug,
      gender: p.gender ?? '',
      grade: p.grade ?? '',
    });
  }
  return result;
}
