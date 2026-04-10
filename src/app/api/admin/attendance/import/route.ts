import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const roleParam = (formData.get('role') as string | null) ?? '';
    const isStaff = roleParam === 'staff';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!groupId) {
      return NextResponse.json({ error: 'No group_id provided' }, { status: 400 });
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
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch profiles to match by name. For the staff view we limit to
    // madrich/mazkirut of the target group; otherwise we take all profiles
    // (the original chanichim import behavior).
    let profiles: Array<{ id: string; first_name: string; last_name: string }> = [];
    if (isStaff) {
      const { data: staff, error: staffErr } = await supabase
        .from('group_memberships')
        .select('profiles(id, first_name, last_name)')
        .eq('group_id', groupId)
        .in('role', ['madrich', 'mazkirut'])
        .eq('is_active', true);
      if (staffErr) {
        return NextResponse.json(
          { error: `Failed to fetch staff: ${staffErr.message}` },
          { status: 500 }
        );
      }
      profiles = (staff ?? [])
        .map(
          (m) =>
            m.profiles as unknown as {
              id: string;
              first_name: string;
              last_name: string;
            } | null
        )
        .filter((p): p is { id: string; first_name: string; last_name: string } => p !== null);
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

    // Fetch sessions for this group on the relevant dates
    const dates = dateColumns.map((dc) => dc.date);
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, session_date, is_cancelled, is_locked, is_locked_staff')
      .eq('group_id', groupId)
      .in('session_date', dates);

    if (sessionsError) {
      return NextResponse.json(
        { error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    // Build a lookup map: date → { id, locked }
    const sessionMap = new Map<string, { id: string; locked: boolean }>();
    for (const s of sessions ?? []) {
      sessionMap.set(s.session_date, {
        id: s.id,
        locked: isStaff ? !!s.is_locked_staff : !!s.is_locked,
      });
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

      for (const dc of dateColumns) {
        const status = interpretStatus(row?.[dc.index]);
        if (status === null) continue;

        const sess = sessionMap.get(dc.date);
        if (!sess) continue;
        if (sess.locked) continue; // don't overwrite locked rows

        upserts.push({
          session_id: sess.id,
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
