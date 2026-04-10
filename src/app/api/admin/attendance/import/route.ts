import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';

interface AreaConfig {
  areas?: string[];
  slugs?: string[];
  alwaysIncludeSlugs?: string[];
}

const AREA_CONFIG: Record<string, AreaConfig> = {
  katan: { areas: ['katan'], alwaysIncludeSlugs: ['staff-planning'] },
  noar: { areas: ['noar'], alwaysIncludeSlugs: ['staff-planning'] },
  'pre-som': { slugs: ['pre-som'], alwaysIncludeSlugs: ['staff-planning'] },
  som: { slugs: ['som', 'som-planning'] },
};

const MONTH_MAP: Record<string, { month: number; year: number }> = {
  Jan: { month: 1, year: 2026 },
  Feb: { month: 2, year: 2026 },
  Mar: { month: 3, year: 2026 },
  Apr: { month: 4, year: 2026 },
  May: { month: 5, year: 2026 },
  Jun: { month: 6, year: 2026 },
  Jul: { month: 7, year: 2025 },
  Aug: { month: 8, year: 2025 },
  Sep: { month: 9, year: 2025 },
  Oct: { month: 10, year: 2025 },
  Nov: { month: 11, year: 2025 },
  Dec: { month: 12, year: 2025 },
};

/**
 * Parses a header cell into a YYYY-MM-DD date string. Accepts:
 *   "Sep 13"           (old format)
 *   "Wed Sep 13"       (with weekday prefix)
 *   "Sat, Aug 20"      (with weekday + comma)
 *   "8/20/2025"        (us numeric)
 *   "2025-08-20"       (ISO)
 *   Excel native Date objects (when the cell is typed as date)
 *   Excel serial numbers (when cellDates is off)
 *
 * Returns null if it can't figure out what date it is.
 */
function parseHeaderDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  // Native Date object (from xlsx with cellDates:true)
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  // Excel serial number
  if (typeof raw === 'number' && isFinite(raw)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = raw * 86400 * 1000;
    const d = new Date(epoch.getTime() + ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return null;
  if (s.includes('(NS)')) return null;

  // Strip leading weekday (Mon, Tue, Wed, ...) and optional comma
  const stripped = s.replace(/^[A-Za-z]{3,9},?\s+/, '').trim();

  // "Aug 20" style
  const monthDayMatch = stripped.match(/^([A-Za-z]+)\s+(\d+)(?:,?\s*(\d{4}))?$/);
  if (monthDayMatch) {
    const [, monthStr, dayStr, yearStr] = monthDayMatch;
    const key = monthStr.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
    const mapping = MONTH_MAP[key];
    if (mapping) {
      const year = yearStr ? parseInt(yearStr, 10) : mapping.year;
      const day = parseInt(dayStr, 10);
      return `${year}-${String(mapping.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // ISO or MDY
  const native = new Date(s);
  if (!isNaN(native.getTime())) {
    return native.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Given a grid of raw cells, return the row index whose columns contain the
 * most parseable dates. We try rows 0 and 1 — row 0 is the typical header,
 * but some files have a session-type label in row 0 and the actual dates in
 * row 1 (like the SOM Mechanchim Google Sheet).
 */
function pickHeaderRow(grid: unknown[][]): { headerIdx: number; dataStart: number } {
  const candidates = [0, 1].filter((i) => i < grid.length);
  let best = { idx: 0, count: 0 };
  for (const idx of candidates) {
    const row = grid[idx] ?? [];
    let count = 0;
    for (let c = 1; c < row.length; c++) {
      if (parseHeaderDate(row[c])) count += 1;
    }
    if (count > best.count) best = { idx, count };
  }
  return { headerIdx: best.idx, dataStart: best.idx + 1 };
}

/**
 * Splits a raw name into firstName / lastName. Accepts both "Last, First"
 * and "First Last" (including multi-word first names like "Maria Jose Cohen"
 * where the last word is treated as the last name).
 */
function parseName(raw: string): { firstName: string; lastName: string } | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim());
    if (!last || !first) return null;
    return { firstName: first, lastName: last };
  }
  const parts = s.split(/\s+/);
  if (parts.length < 2) return null;
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function interpretStatus(raw: unknown): 'present' | 'late' | 'excused' | null {
  if (raw === true) return 'present';
  if (raw === false) return null;
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v || v === '0' || v === 'no' || v === 'n' || v === '-') return null;
  if (
    v === 'x' ||
    v === 'p' ||
    v === '✓' ||
    v === '✔' ||
    v === 'true' ||
    v === 'yes' ||
    v === 'y' ||
    v === '1' ||
    v === 'present'
  )
    return 'present';
  if (v === 'l' || v === 'late') return 'late';
  if (v === 'e' || v === 'ex' || v === 'excused') return 'excused';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const groupId = formData.get('group_id') as string | null;
    const areaParam = formData.get('area') as string | null;
    const roleParam = (formData.get('role') as string | null) ?? '';
    const isStaff = roleParam === 'staff' || !!areaParam;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!groupId && !areaParam) {
      return NextResponse.json(
        { error: 'group_id or area is required' },
        { status: 400 }
      );
    }
    if (areaParam && !AREA_CONFIG[areaParam]) {
      return NextResponse.json(
        { error: 'Invalid area (expected katan, noar, pre-som, or som)' },
        { status: 400 }
      );
    }

    // Read the XLSX file — cellDates:true so native date cells round-trip correctly
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Spreadsheet has no data rows' }, { status: 400 });
    }

    // Figure out which row has the date headers
    const { headerIdx, dataStart } = pickHeaderRow(rows);
    const headers = rows[headerIdx] ?? [];

    // Parse date columns (column 0 is names, column 1 may be "%" or a date)
    const dateColumns: { index: number; date: string }[] = [];
    for (let i = 1; i < headers.length; i++) {
      const date = parseHeaderDate(headers[i]);
      if (date) {
        dateColumns.push({ index: i, date });
      }
    }

    if (dateColumns.length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid date columns found. Expected headers like "Sep 13", "Wed Aug 20", or native Excel dates.',
          detectedHeaderRow: headerIdx,
          firstHeaderRowValues: (rows[0] ?? []).slice(0, 10).map((v) => String(v ?? '')),
          secondHeaderRowValues: (rows[1] ?? []).slice(0, 10).map((v) => String(v ?? '')),
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ─── Resolve the group set we're importing into ───
    // For group_id path: single group.
    // For area path: all groups in the area (including the relevant planning group).
    let targetGroupIds: string[] = [];
    if (areaParam) {
      const config = AREA_CONFIG[areaParam];
      const orConditions: string[] = [];
      if (config.areas?.length) orConditions.push(`area.in.(${config.areas.join(',')})`);
      if (config.slugs?.length) orConditions.push(`slug.in.(${config.slugs.join(',')})`);

      let areaGroups: Array<{ id: string; slug: string }> = [];
      if (orConditions.length > 0) {
        const { data, error } = await supabase
          .from('groups')
          .select('id, slug')
          .or(orConditions.join(','))
          .eq('is_active', true);
        if (error) {
          return NextResponse.json(
            { error: `Failed to resolve area groups: ${error.message}` },
            { status: 500 }
          );
        }
        areaGroups = data ?? [];
      }
      if (config.alwaysIncludeSlugs?.length) {
        const { data: extras } = await supabase
          .from('groups')
          .select('id, slug')
          .in('slug', config.alwaysIncludeSlugs)
          .eq('is_active', true);
        for (const e of extras ?? []) {
          if (!areaGroups.some((g) => g.id === e.id)) areaGroups.push(e);
        }
      }
      targetGroupIds = areaGroups.map((g) => g.id);
    } else if (groupId) {
      targetGroupIds = [groupId];
    }

    if (targetGroupIds.length === 0) {
      return NextResponse.json(
        { error: 'No groups matched the area filter' },
        { status: 400 }
      );
    }

    // ─── Fetch profiles to match by name ───
    // For the staff view we limit to madrich/mazkirut of the target groups;
    // otherwise we take all profiles (original chanichim import behavior).
    let profiles: Array<{ id: string; first_name: string; last_name: string }> = [];
    if (isStaff) {
      const { data: staff, error: staffErr } = await supabase
        .from('group_memberships')
        .select('profiles(id, first_name, last_name)')
        .in('group_id', targetGroupIds)
        .in('role', ['madrich', 'mazkirut'])
        .eq('is_active', true);
      if (staffErr) {
        return NextResponse.json(
          { error: `Failed to fetch staff: ${staffErr.message}` },
          { status: 500 }
        );
      }
      // Dedupe (a member can belong to multiple groups in the area)
      const uniq = new Map<string, { id: string; first_name: string; last_name: string }>();
      for (const m of staff ?? []) {
        const p = m.profiles as unknown as {
          id: string;
          first_name: string;
          last_name: string;
        } | null;
        if (!p) continue;
        if (!uniq.has(p.id)) uniq.set(p.id, p);
      }
      profiles = Array.from(uniq.values());
    } else {
      const { data, error } = await supabase.from('profiles').select('id, first_name, last_name');
      if (error) {
        return NextResponse.json(
          { error: `Failed to fetch profiles: ${error.message}` },
          { status: 500 }
        );
      }
      profiles = data ?? [];
    }

    // Build a lookup map: normalized name → profile id. We store multiple
    // variants so we match regardless of "Last, First" vs "First Last".
    const profileMap = new Map<string, string>();
    for (const p of profiles) {
      const first = normalize(p.first_name ?? '');
      const last = normalize(p.last_name ?? '');
      profileMap.set(`${last}|${first}`, p.id);
      profileMap.set(`${first} ${last}`, p.id);
      profileMap.set(`${last} ${first}`, p.id);
    }

    // Fetch sessions for these groups on the relevant dates. For the area
    // path, a single date may match multiple groups (e.g. a madrich in
    // Katan 1st Grade and another in Katan 5th Grade), so we keep them
    // keyed by (date, group_id).
    const dates = dateColumns.map((dc) => dc.date);
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, group_id, session_date, is_cancelled, is_locked, is_locked_staff')
      .in('group_id', targetGroupIds)
      .in('session_date', dates);

    if (sessionsError) {
      return NextResponse.json(
        { error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    // sessionsByDate: date → list of { id, group_id, locked }
    const sessionsByDate = new Map<
      string,
      Array<{ id: string; groupId: string; locked: boolean }>
    >();
    for (const s of sessions ?? []) {
      const locked = isStaff ? !!s.is_locked_staff : !!s.is_locked;
      const list = sessionsByDate.get(s.session_date) ?? [];
      list.push({ id: s.id, groupId: s.group_id, locked });
      sessionsByDate.set(s.session_date, list);
    }

    // We also need to know which group(s) each profile belongs to, so we
    // can pick the right session for each (profile, date) pair when there
    // are multiple sessions on the same date.
    const profileGroups = new Map<string, Set<string>>();
    if (isStaff) {
      const { data: allMems } = await supabase
        .from('group_memberships')
        .select('profile_id, group_id')
        .in('group_id', targetGroupIds)
        .in('role', ['madrich', 'mazkirut'])
        .eq('is_active', true);
      for (const m of allMems ?? []) {
        if (!profileGroups.has(m.profile_id)) profileGroups.set(m.profile_id, new Set());
        profileGroups.get(m.profile_id)!.add(m.group_id);
      }
    }

    const skipped: string[] = [];
    const errors: string[] = [];

    // Build all upsert records at once
    const upserts: {
      session_id: string;
      participant_id: string;
      status: string;
      marked_at: string;
    }[] = [];

    for (let rowIdx = dataStart; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rawName = String(row?.[0] ?? '').trim();
      if (!rawName) continue;

      const parsed = parseName(rawName);
      if (!parsed) {
        skipped.push(rawName);
        continue;
      }

      const first = normalize(parsed.firstName);
      const last = normalize(parsed.lastName);
      const profileId =
        profileMap.get(`${last}|${first}`) ??
        profileMap.get(`${first} ${last}`) ??
        profileMap.get(`${last} ${first}`);
      if (!profileId) {
        skipped.push(rawName);
        continue;
      }

      const myGroups = profileGroups.get(profileId);

      for (const dc of dateColumns) {
        const status = interpretStatus(row?.[dc.index]);
        if (status === null) continue;

        const candidates = sessionsByDate.get(dc.date);
        if (!candidates || candidates.length === 0) continue;

        // Pick the session that belongs to one of this profile's groups.
        // For the single-group path (chanichim), there's only ever one
        // candidate. For the area path, we need to match by membership.
        let session = candidates[0];
        if (myGroups && candidates.length > 0) {
          const match = candidates.find((c) => myGroups.has(c.groupId));
          if (match) session = match;
          else if (!isStaff) {
            // chanichim fallback: use the single candidate
            session = candidates[0];
          } else {
            // No matching group for this profile on this date — skip cell
            continue;
          }
        }

        if (session.locked) continue; // don't overwrite locked rows

        upserts.push({
          session_id: session.id,
          participant_id: profileId,
          status,
          marked_at: new Date().toISOString(),
        });
      }
    }

    // Batch upsert in chunks of 500
    let imported = 0;
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error: upsertError } = await supabase
        .from('attendance_records')
        .upsert(chunk, { onConflict: 'session_id,participant_id' });

      if (upsertError) {
        errors.push(`Batch ${Math.floor(i / 500) + 1}: ${upsertError.message}`);
      } else {
        imported += chunk.length;
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors,
      totalRows: rows.length - dataStart,
      dateColumns: dateColumns.length,
      headerRow: headerIdx,
      profilesLoaded: profiles.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
