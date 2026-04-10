import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Status = 'present' | 'late' | 'excused' | 'absent';

interface ImportRecord {
  profileId: string;
  sessionId: string;
  status: Status;
}

function isStatus(v: unknown): v is Status {
  return v === 'present' || v === 'late' || v === 'excused' || v === 'absent';
}

/**
 * POST /api/admin/madrich-attendance/bulk-import
 *
 * Body: { groupId: string, records: Array<{ profileId, sessionId, status }> }
 *
 * Bulk upsert of staff attendance rows, used by the Excel upload flow on
 * /admin/madrich-attendance/upload. Validates that every session belongs
 * to the requested group, that the caller coordinates the group (or is
 * admin), that every profile is an active madrich/mazkirut member of the
 * group, and that no session is locked or cancelled. Writes happen in a
 * loop so a single bad row doesn't take down the whole import — we return
 * succeeded / failed counts and any per-record errors.
 */
export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const groupId: string | undefined = body?.groupId;
  const records: unknown = body?.records;

  if (!groupId || !Array.isArray(records)) {
    return NextResponse.json(
      { error: 'groupId and records[] are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Access check: admin or coordinator of this group
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (callerProfile.role !== 'admin') {
    if (callerProfile.role !== 'coordinator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: myCoord } = await admin
      .from('group_memberships')
      .select('id')
      .eq('profile_id', user.id)
      .eq('group_id', groupId)
      .eq('role', 'coordinator')
      .eq('is_active', true)
      .maybeSingle();
    if (!myCoord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Load valid staff profile ids for this group
  const { data: staffRows } = await admin
    .from('group_memberships')
    .select('profile_id')
    .eq('group_id', groupId)
    .in('role', ['madrich', 'mazkirut'])
    .eq('is_active', true);
  const staffIds = new Set((staffRows ?? []).map((r) => r.profile_id));

  // Load session ids that belong to this group, with their lock/cancel status
  const { data: sessionRows } = await admin
    .from('sessions')
    .select('id, is_locked_staff, is_cancelled')
    .eq('group_id', groupId);
  const sessionMap = new Map(
    (sessionRows ?? []).map((s) => [
      s.id,
      { isLocked: s.is_locked_staff as boolean, isCancelled: s.is_cancelled as boolean },
    ])
  );

  const valid: ImportRecord[] = [];
  const errors: Array<{ profileId: string; sessionId: string; reason: string }> = [];

  for (const raw of records as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { profileId?: unknown; sessionId?: unknown; status?: unknown };

    if (typeof r.profileId !== 'string' || typeof r.sessionId !== 'string') {
      errors.push({
        profileId: String(r.profileId ?? ''),
        sessionId: String(r.sessionId ?? ''),
        reason: 'Missing profileId or sessionId',
      });
      continue;
    }
    if (!isStatus(r.status)) {
      errors.push({
        profileId: r.profileId,
        sessionId: r.sessionId,
        reason: 'Invalid status',
      });
      continue;
    }

    if (!staffIds.has(r.profileId)) {
      errors.push({
        profileId: r.profileId,
        sessionId: r.sessionId,
        reason: 'Not a staff member of this group',
      });
      continue;
    }

    const session = sessionMap.get(r.sessionId);
    if (!session) {
      errors.push({
        profileId: r.profileId,
        sessionId: r.sessionId,
        reason: 'Session does not belong to this group',
      });
      continue;
    }
    if (session.isCancelled) {
      errors.push({
        profileId: r.profileId,
        sessionId: r.sessionId,
        reason: 'Session is cancelled',
      });
      continue;
    }
    if (session.isLocked) {
      errors.push({
        profileId: r.profileId,
        sessionId: r.sessionId,
        reason: 'Session is locked (unlock first)',
      });
      continue;
    }

    valid.push({
      profileId: r.profileId,
      sessionId: r.sessionId,
      status: r.status,
    });
  }

  // Upsert in one call — attendance_records has a unique constraint on
  // (session_id, participant_id) so we can use onConflict cleanly.
  let succeeded = 0;
  if (valid.length > 0) {
    const now = new Date().toISOString();
    const payload = valid.map((v) => ({
      session_id: v.sessionId,
      participant_id: v.profileId,
      status: v.status,
      marked_by: user.id,
      marked_at: now,
    }));

    const { error: upsertError } = await admin
      .from('attendance_records')
      .upsert(payload, { onConflict: 'session_id,participant_id' });

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message, errors },
        { status: 500 }
      );
    }
    succeeded = valid.length;
  }

  return NextResponse.json({
    ok: true,
    succeeded,
    failed: errors.length,
    errors: errors.slice(0, 50),
  });
}
