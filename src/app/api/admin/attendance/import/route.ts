import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';

const MONTH_MAP: Record<string, { month: number; year: number }> = {
  Sep: { month: 9, year: 2025 },
  Oct: { month: 10, year: 2025 },
  Nov: { month: 11, year: 2025 },
  Dec: { month: 12, year: 2025 },
  Jan: { month: 1, year: 2026 },
  Feb: { month: 2, year: 2026 },
  Mar: { month: 3, year: 2026 },
  Apr: { month: 4, year: 2026 },
  May: { month: 5, year: 2026 },
};

function parseHeaderDate(header: string): string | null {
  // Skip "(NS)" no-session dates
  if (header.includes('(NS)')) return null;

  const match = header.trim().match(/^([A-Za-z]+)\s+(\d+)$/);
  if (!match) return null;

  const [, monthStr, dayStr] = match;
  const mapping = MONTH_MAP[monthStr];
  if (!mapping) return null;

  const day = parseInt(dayStr, 10);
  const monthPadded = String(mapping.month).padStart(2, '0');
  const dayPadded = String(day).padStart(2, '0');

  return `${mapping.year}-${monthPadded}-${dayPadded}`;
}

function parseName(raw: string): { firstName: string; lastName: string } | null {
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length < 2) return null;
  return { lastName: parts[0], firstName: parts[1] };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const groupId = formData.get('group_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!groupId) {
      return NextResponse.json({ error: 'No group_id provided' }, { status: 400 });
    }

    // Read the XLSX file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Use "SOM Attendance" sheet or fall back to first sheet
    const sheetName = workbook.SheetNames.includes('SOM Attendance')
      ? 'SOM Attendance'
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    });

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Spreadsheet has no data rows' }, { status: 400 });
    }

    const headers = rows[0].map(String);

    // Parse date columns: skip "Name" (index 0) and "%" (index 1)
    const dateColumns: { index: number; date: string }[] = [];
    for (let i = 2; i < headers.length; i++) {
      const date = parseHeaderDate(headers[i]);
      if (date) {
        dateColumns.push({ index: i, date });
      }
    }

    if (dateColumns.length === 0) {
      return NextResponse.json({ error: 'No valid date columns found' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch all profiles for matching
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name');

    if (profilesError) {
      return NextResponse.json(
        { error: `Failed to fetch profiles: ${profilesError.message}` },
        { status: 500 }
      );
    }

    // Build a lookup map: "lastname|firstname" (lowercased) → profile id
    const profileMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      const key = `${(p.last_name ?? '').toLowerCase()}|${(p.first_name ?? '').toLowerCase()}`;
      profileMap.set(key, p.id);
    }

    // Fetch sessions for this group on the relevant dates
    const dates = dateColumns.map((dc) => dc.date);
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, session_date')
      .eq('group_id', groupId)
      .in('session_date', dates);

    if (sessionsError) {
      return NextResponse.json(
        { error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    // Build a lookup map: date string → session id
    const sessionMap = new Map<string, string>();
    for (const s of sessions ?? []) {
      sessionMap.set(s.session_date, s.id);
    }

    let imported = 0;
    const skipped: string[] = [];
    const errors: string[] = [];

    // Process each data row
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rawName = String(row[0] ?? '').trim();
      if (!rawName) continue;

      const parsed = parseName(rawName);
      if (!parsed) {
        skipped.push(`Row ${rowIdx + 1}: Could not parse name "${rawName}"`);
        continue;
      }

      const key = `${parsed.lastName.toLowerCase()}|${parsed.firstName.toLowerCase()}`;
      const profileId = profileMap.get(key);
      if (!profileId) {
        skipped.push(`Row ${rowIdx + 1}: No matching profile for "${rawName}"`);
        continue;
      }

      for (const dc of dateColumns) {
        const cellValue = String(row[dc.index] ?? '').trim().toUpperCase();
        if (cellValue !== 'P' && cellValue !== 'A') continue;

        const sessionId = sessionMap.get(dc.date);
        if (!sessionId) {
          errors.push(`No session found for date ${dc.date} in group ${groupId}`);
          continue;
        }

        const status = cellValue === 'P' ? 'present' : 'absent';

        const { error: upsertError } = await supabase
          .from('attendance_records')
          .upsert(
            {
              session_id: sessionId,
              participant_id: profileId,
              status,
            },
            { onConflict: 'session_id,participant_id' }
          );

        if (upsertError) {
          errors.push(
            `Failed to upsert attendance for "${rawName}" on ${dc.date}: ${upsertError.message}`
          );
        } else {
          imported++;
        }
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
