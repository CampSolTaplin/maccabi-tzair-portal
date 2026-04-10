import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/supabase/auth-helpers';

/**
 * POST /api/admin/events/[eventId]/attendance/bulk
 *
 * Body: { names: string[] }
 *
 * Matches each name against the profiles of the event's linked groups
 * (participants, madrichim and mazkirut) and marks the matched profiles
 * as attending. Names that can't be matched against anyone in the
 * linked groups are returned in `unmatched` for the user to fix.
 *
 * Accepts both "First Last" and "Last, First" variants with
 * case/diacritic normalization.
 */

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const body = await request.json().catch(() => null);
    const rawNames: unknown = body?.names;
    if (!Array.isArray(rawNames)) {
      return NextResponse.json(
        { error: 'names[] is required in the request body' },
        { status: 400 }
      );
    }

    // Clean the list: drop empties, trim
    const names: string[] = rawNames
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0);

    const supabase = createAdminClient();

    const auth = await getAuthContext(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 1. Get the event's linked groups
    const { data: eventGroups, error: egErr } = await supabase
      .from('event_groups')
      .select('group_id')
      .eq('event_id', eventId);
    if (egErr) {
      return NextResponse.json(
        { error: `Failed to fetch event groups: ${egErr.message}` },
        { status: 500 }
      );
    }
    let groupIds = (eventGroups ?? []).map((eg) => eg.group_id);

    // Coordinator access: only the groups they coordinate that are linked to the event
    if (auth.groupIds) {
      const authorized = new Set(auth.groupIds);
      groupIds = groupIds.filter((id) => authorized.has(id));
      if (groupIds.length === 0) {
        return NextResponse.json(
          { error: 'You do not coordinate any of this event\'s groups' },
          { status: 403 }
        );
      }
    }

    if (groupIds.length === 0) {
      return NextResponse.json(
        { error: 'Event has no linked groups' },
        { status: 400 }
      );
    }

    // 2. Load all members of those groups (participants, madrichim, mazkirut)
    const { data: memberships, error: memErr } = await supabase
      .from('group_memberships')
      .select('profile_id, profiles(id, first_name, last_name, is_active)')
      .in('group_id', groupIds)
      .in('role', ['participant', 'madrich', 'mazkirut'])
      .eq('is_active', true);
    if (memErr) {
      return NextResponse.json(
        { error: `Failed to load members: ${memErr.message}` },
        { status: 500 }
      );
    }

    // Dedupe + build name lookup map
    const profileMap = new Map<string, string>(); // normalized key → profile id
    const seen = new Set<string>();
    for (const m of memberships ?? []) {
      const p = m.profiles as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
      } | null;
      if (!p || seen.has(p.id) || !p.is_active) continue;
      seen.add(p.id);

      const first = normalize(p.first_name ?? '');
      const last = normalize(p.last_name ?? '');
      profileMap.set(`${first} ${last}`, p.id);
      profileMap.set(`${last} ${first}`, p.id);
      profileMap.set(`${last}|${first}`, p.id);
    }

    // 3. Match pasted names
    const matchedIds = new Set<string>();
    const unmatched: string[] = [];
    for (const raw of names) {
      const parsed = parseName(raw);
      if (!parsed) {
        unmatched.push(raw);
        continue;
      }
      const first = normalize(parsed.firstName);
      const last = normalize(parsed.lastName);
      const id =
        profileMap.get(`${last}|${first}`) ??
        profileMap.get(`${first} ${last}`) ??
        profileMap.get(`${last} ${first}`);
      if (id) {
        matchedIds.add(id);
      } else {
        unmatched.push(raw);
      }
    }

    // 4. Upsert attendance for all matched profiles
    let upserted = 0;
    if (matchedIds.size > 0) {
      const rows = Array.from(matchedIds).map((profileId) => ({
        event_id: eventId,
        participant_id: profileId,
        attended: true,
      }));

      const { error: upErr } = await supabase
        .from('event_attendance')
        .upsert(rows, { onConflict: 'event_id,participant_id' });
      if (upErr) {
        return NextResponse.json(
          { error: `Failed to save attendance: ${upErr.message}` },
          { status: 500 }
        );
      }
      upserted = rows.length;
    }

    return NextResponse.json({
      ok: true,
      matched: matchedIds.size,
      upserted,
      unmatched,
      totalInput: names.length,
    });
  } catch (err) {
    console.error('Bulk event attendance error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk import failed' },
      { status: 500 }
    );
  }
}
