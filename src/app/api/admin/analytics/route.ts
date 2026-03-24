import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

/* ─── Group mapping from Full Course Option Name ─── */

interface GroupMapping {
  slug: string;
  name: string;
}

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

// Keywords that indicate trip/seminar/event enrollments to skip
const SKIP_KEYWORDS = [
  'trip', 'seminar', 'sleepover', 'machane', 'retreat',
  'shabbaton', 'camping', 'camp ',
];

function mapCourseToGroup(courseOptionName: string): GroupMapping | null {
  if (!courseOptionName) return null;
  const lower = courseOptionName.toLowerCase();

  // Skip trips/seminars/sleepovers/machane enrollments
  for (const kw of SKIP_KEYWORDS) {
    if (lower.includes(kw)) return null;
  }

  // Order matters: check Pre-SOM before SOM
  if (lower.includes('kindergarten'))
    return { slug: 'katan-kinder', name: 'Kinder' };
  if (lower.includes('1st grade'))
    return { slug: 'katan-1st', name: '1st Grade' };
  if (lower.includes('2nd grade'))
    return { slug: 'katan-2nd', name: '2nd Grade' };
  if (lower.includes('3rd grade'))
    return { slug: 'katan-3rd', name: '3rd Grade' };
  if (lower.includes('4th grade'))
    return { slug: 'katan-4th', name: '4th Grade' };
  if (lower.includes('5th grade'))
    return { slug: 'katan-5th', name: '5th Grade' };
  if (lower.includes('6th grade') || lower.includes('noar 6th'))
    return { slug: 'noar-6th', name: '6th Grade' };
  if (lower.includes('7th grade') || lower.includes('noar 7th'))
    return { slug: 'noar-7th', name: '7th Grade' };
  if (lower.includes('8th grade') || lower.includes('noar 8th'))
    return { slug: 'noar-8th', name: '8th Grade' };
  if (
    lower.includes('pre-som') ||
    lower.includes('pre school of madrichim')
  )
    return { slug: 'pre-som', name: 'Pre-SOM' };
  if (
    lower.includes('som') ||
    lower.includes('school of madrichim')
  )
    return { slug: 'som', name: 'SOM' };

  return null;
}

/* ─── Normalize Salesforce ID to 15-char ─── */
function normalizeSfId(id: string | null | undefined): string {
  if (!id) return '';
  return id.substring(0, 15);
}

/* ─── Paginated Supabase fetch ─── */
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await queryFn(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

/* ─── Types for XLSX participant ─── */
interface XlsxParticipant {
  name: string;
  gender: string;
  age: string;
  grade: string;
  school: string;
  contactId: string;
  groupSlug: string;
  groupName: string;
}

/* ─── POST Handler ─── */

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse XLSX
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Skip header row
    const dataRows = rows.slice(1).filter((r) => r && r.length > 0);

    // Extract unique participants by Contact ID (col 16)
    // For each contact, collect all enrollments then pick the regular-program one
    const enrollmentsByContact = new Map<
      string,
      { row: unknown[]; groups: GroupMapping[] }
    >();

    for (const row of dataRows) {
      const contactId = String(row[16] ?? '').trim();
      if (!contactId) continue;

      const normalized = normalizeSfId(contactId);
      const courseOption = String(row[20] ?? '').trim();
      const group = mapCourseToGroup(courseOption);

      if (!enrollmentsByContact.has(normalized)) {
        enrollmentsByContact.set(normalized, { row, groups: [] });
      }

      if (group) {
        enrollmentsByContact.get(normalized)!.groups.push(group);
      }
    }

    // Build last-year participants map
    const lastYearMap = new Map<string, XlsxParticipant>();

    for (const [normalizedId, { row, groups }] of enrollmentsByContact) {
      // Pick the first regular-program group found
      const group = groups[0];
      if (!group) continue; // No regular program enrollment

      lastYearMap.set(normalizedId, {
        name: String(row[0] ?? '').trim(),
        gender: String(row[1] ?? '').trim(),
        age: String(row[3] ?? '').trim(),
        grade: String(row[5] ?? '').trim(),
        school: String(row[6] ?? '').trim(),
        contactId: String(row[16] ?? '').trim(),
        groupSlug: group.slug,
        groupName: group.name,
      });
    }

    // ─── Fetch current-year data from DB ───

    // 1. All active participant profiles with salesforce_contact_id
    const currentProfiles = await fetchAllRows<{
      id: string;
      first_name: string;
      last_name: string;
      display_name: string;
      salesforce_contact_id: string | null;
      grade: string | null;
      school: string | null;
    }>((from, to) =>
      adminClient
        .from('profiles')
        .select('id, first_name, last_name, display_name, salesforce_contact_id, grade, school')
        .eq('role', 'participant')
        .eq('is_active', true)
        .range(from, to)
    );

    // 2. All active group memberships for participants
    const allMemberships = await fetchAllRows<{
      profile_id: string;
      group_id: string;
      role: string;
    }>((from, to) =>
      adminClient
        .from('group_memberships')
        .select('profile_id, group_id, role')
        .eq('role', 'participant')
        .eq('is_active', true)
        .range(from, to)
    );

    // 3. All groups for slug lookup
    const { data: allGroups } = await adminClient
      .from('groups')
      .select('id, slug, name')
      .eq('is_active', true);

    const groupById = new Map<string, { slug: string; name: string }>();
    const groupBySlug = new Map<string, string>(); // slug -> id
    for (const g of allGroups ?? []) {
      groupById.set(g.id, { slug: g.slug, name: g.name });
      groupBySlug.set(g.slug, g.id);
    }

    // Build current-year participant map (normalized SF ID -> data)
    const membershipsByProfile = new Map<string, string[]>();
    for (const m of allMemberships) {
      if (!membershipsByProfile.has(m.profile_id)) {
        membershipsByProfile.set(m.profile_id, []);
      }
      membershipsByProfile.get(m.profile_id)!.push(m.group_id);
    }

    interface CurrentParticipant {
      id: string;
      name: string;
      sfContactId: string;
      normalizedSfId: string;
      groupSlugs: string[];
      grade: string | null;
      school: string | null;
    }

    const thisYearMap = new Map<string, CurrentParticipant>();

    for (const p of currentProfiles) {
      if (!p.salesforce_contact_id) continue;
      const normalizedId = normalizeSfId(p.salesforce_contact_id);
      const groupIds = membershipsByProfile.get(p.id) ?? [];
      const slugs = groupIds
        .map((gid) => groupById.get(gid)?.slug)
        .filter((s): s is string => !!s);

      thisYearMap.set(normalizedId, {
        id: p.id,
        name: p.display_name || `${p.first_name} ${p.last_name}`,
        sfContactId: p.salesforce_contact_id,
        normalizedSfId: normalizedId,
        groupSlugs: slugs,
        grade: p.grade,
        school: p.school,
      });
    }

    // ─── Compute retention/growth metrics ───

    const allSlugs = Object.keys(GROUP_DISPLAY);

    // Per-group counters
    const groupStats: Record<
      string,
      { lastYear: Set<string>; thisYear: Set<string>; returned: Set<string> }
    > = {};
    for (const slug of allSlugs) {
      groupStats[slug] = {
        lastYear: new Set(),
        thisYear: new Set(),
        returned: new Set(),
      };
    }

    // Populate last-year per group
    for (const [nid, p] of lastYearMap) {
      if (groupStats[p.groupSlug]) {
        groupStats[p.groupSlug].lastYear.add(nid);
      }
    }

    // Populate this-year per group
    for (const [nid, p] of thisYearMap) {
      for (const slug of p.groupSlugs) {
        if (groupStats[slug]) {
          groupStats[slug].thisYear.add(nid);
        }
      }
    }

    // Compute returned/new/lost
    const returnedIds = new Set<string>();
    const newIds = new Set<string>();
    const lostIds = new Set<string>();

    for (const nid of lastYearMap.keys()) {
      if (thisYearMap.has(nid)) {
        returnedIds.add(nid);
      } else {
        lostIds.add(nid);
      }
    }

    for (const nid of thisYearMap.keys()) {
      if (!lastYearMap.has(nid)) {
        newIds.add(nid);
      }
    }

    // Populate returned per group
    for (const nid of returnedIds) {
      const lastP = lastYearMap.get(nid)!;
      if (groupStats[lastP.groupSlug]) {
        groupStats[lastP.groupSlug].returned.add(nid);
      }
    }

    // Summary
    const lastYearTotal = lastYearMap.size;
    const thisYearTotal = thisYearMap.size;
    const retentionRate =
      lastYearTotal > 0
        ? Math.round((returnedIds.size / lastYearTotal) * 100)
        : 0;
    const growthRate =
      lastYearTotal > 0
        ? Math.round(((thisYearTotal - lastYearTotal) / lastYearTotal) * 100)
        : 0;

    // By-group data
    const byGroup = allSlugs.map((slug) => {
      const gs = groupStats[slug];
      const ly = gs.lastYear.size;
      const ty = gs.thisYear.size;
      const ret = gs.returned.size;
      const newG = ty - ret;
      const lostG = ly - ret;
      const retPct = ly > 0 ? Math.round((ret / ly) * 100) : 0;

      return {
        slug,
        name: GROUP_DISPLAY[slug],
        lastYear: ly,
        thisYear: ty,
        returned: ret,
        new: newG,
        lost: lostG,
        retentionPct: retPct,
      };
    });

    // Lost participants detail
    const lostParticipants = Array.from(lostIds).map((nid) => {
      const p = lastYearMap.get(nid)!;
      return {
        name: p.name,
        group: GROUP_DISPLAY[p.groupSlug] ?? p.groupSlug,
        grade: p.grade,
        contactId: p.contactId,
      };
    });

    // Returned participants with group transition info
    const returnedParticipants = Array.from(returnedIds).map((nid) => {
      const lastP = lastYearMap.get(nid)!;
      const currP = thisYearMap.get(nid)!;
      const lastGroup = lastP.groupSlug;
      // Pick the "main" current group (first match in known slugs)
      const thisGroup =
        currP.groupSlugs.find((s) => allSlugs.includes(s)) ?? currP.groupSlugs[0] ?? '';

      return {
        name: currP.name,
        lastYearGroup: GROUP_DISPLAY[lastGroup] ?? lastGroup,
        thisYearGroup: GROUP_DISPLAY[thisGroup] ?? thisGroup,
        transitioned: lastGroup !== thisGroup,
      };
    });

    // ─── Attendance stats per group (current year) ───

    // Fetch all sessions and attendance records for this year
    const currentYearStart = '2025-08-01'; // Approximate start of 2025-2026 year
    const allSessions = await fetchAllRows<{
      id: string;
      group_id: string;
    }>((from, to) =>
      adminClient
        .from('sessions')
        .select('id, group_id')
        .gte('session_date', currentYearStart)
        .eq('is_cancelled', false)
        .range(from, to)
    );

    const sessionIds = allSessions.map((s) => s.id);
    const sessionGroupMap = new Map<string, string>();
    for (const s of allSessions) {
      sessionGroupMap.set(s.id, s.group_id);
    }

    // Fetch attendance records in batches (by session IDs)
    const attendanceByGroup = new Map<string, { present: number; total: number }>();

    if (sessionIds.length > 0) {
      const allAttendance = await fetchAllRows<{
        session_id: string;
        status: string;
      }>((from, to) =>
        adminClient
          .from('attendance_records')
          .select('session_id, status')
          .in('session_id', sessionIds)
          .range(from, to)
      );

      for (const rec of allAttendance) {
        const groupId = sessionGroupMap.get(rec.session_id);
        if (!groupId) continue;
        const slug = groupById.get(groupId)?.slug;
        if (!slug) continue;

        if (!attendanceByGroup.has(slug)) {
          attendanceByGroup.set(slug, { present: 0, total: 0 });
        }
        const ag = attendanceByGroup.get(slug)!;
        ag.total += 1;
        if (rec.status === 'present' || rec.status === 'late') {
          ag.present += 1;
        }
      }
    }

    // Merge attendance into byGroup
    const byGroupWithAttendance = byGroup.map((g) => {
      const att = attendanceByGroup.get(g.slug);
      return {
        ...g,
        attendancePct: att && att.total > 0
          ? Math.round((att.present / att.total) * 100)
          : null,
      };
    });

    return NextResponse.json({
      summary: {
        lastYear: { total: lastYearTotal, year: '2024-2025' },
        thisYear: { total: thisYearTotal, year: '2025-2026' },
        returned: returnedIds.size,
        new: newIds.size,
        lost: lostIds.size,
        retentionRate,
        growthRate,
      },
      byGroup: byGroupWithAttendance,
      lostParticipants,
      returnedParticipants,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analytics computation failed' },
      { status: 500 }
    );
  }
}
