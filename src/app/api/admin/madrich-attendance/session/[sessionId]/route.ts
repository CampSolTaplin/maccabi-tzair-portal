import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AttendanceStatus = 'present' | 'late' | 'excused' | 'absent';

function isStatus(value: unknown): value is AttendanceStatus {
  return value === 'present' || value === 'late' || value === 'excused' || value === 'absent';
}

async function requireGroupCoordinatorOrAdmin(
  userId: string,
  groupId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (!profile) return { ok: false, status: 403, error: 'Forbidden' };
  if (profile.role === 'admin') return { ok: true };
  if (profile.role !== 'coordinator') return { ok: false, status: 403, error: 'Forbidden' };

  const { data: coord } = await admin
    .from('group_memberships')
    .select('id')
    .eq('profile_id', userId)
    .eq('group_id', groupId)
    .eq('role', 'coordinator')
    .eq('is_active', true)
    .maybeSingle();
  if (!coord) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

/**
 * GET /api/admin/madrich-attendance/session/:sessionId
 *
 * Returns the existing attendance marks for a session, filtered to just the
 * madrich / mazkirut profiles of that session's group. Used by the
 * coordinator UI to pre-populate the status pills.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: session, error: sessErr } = await admin
    .from('sessions')
    .select('id, group_id, session_date, session_type, is_locked_staff, is_cancelled')
    .eq('id', sessionId)
    .single();
  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const access = await requireGroupCoordinatorOrAdmin(user.id, session.group_id, admin);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Staff profile ids in this group
  const { data: staff } = await admin
    .from('group_memberships')
    .select('profile_id')
    .eq('group_id', session.group_id)
    .in('role', ['madrich', 'mazkirut'])
    .eq('is_active', true);

  const staffIds = new Set((staff ?? []).map((m) => m.profile_id));

  const { data: records } = await admin
    .from('attendance_records')
    .select('participant_id, status')
    .eq('session_id', sessionId);

  const marks: Record<string, AttendanceStatus> = {};
  for (const r of records ?? []) {
    if (staffIds.has(r.participant_id)) {
      marks[r.participant_id] = r.status as AttendanceStatus;
    }
  }

  return NextResponse.json({
    sessionId,
    isLockedStaff: session.is_locked_staff,
    isCancelled: session.is_cancelled,
    marks,
  });
}

/**
 * POST /api/admin/madrich-attendance/session/:sessionId
 *
 * Body: { profileId: string, status: 'present' | 'late' | 'excused' | 'absent' | null }
 *
 * Upserts (or deletes, when status is null) a single attendance record for
 * a madrich / mazkirut on this session. The app layer gates writes by
 * is_locked_staff — not is_locked — so staff marks and chanichim marks
 * can be finalized independently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.profileId !== 'string') {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }
  const profileId: string = body.profileId;
  const status = body.status === null ? null : body.status;
  if (status !== null && !isStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: session, error: sessErr } = await admin
    .from('sessions')
    .select('id, group_id, is_locked_staff, is_cancelled')
    .eq('id', sessionId)
    .single();
  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.is_cancelled) {
    return NextResponse.json({ error: 'Session is cancelled' }, { status: 409 });
  }
  if (session.is_locked_staff) {
    return NextResponse.json({ error: 'Staff attendance is locked for this session' }, { status: 409 });
  }

  const access = await requireGroupCoordinatorOrAdmin(user.id, session.group_id, admin);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Guard: the target profile must be an active madrich / mazkirut member of this group.
  const { data: membership } = await admin
    .from('group_memberships')
    .select('id')
    .eq('group_id', session.group_id)
    .eq('profile_id', profileId)
    .in('role', ['madrich', 'mazkirut'])
    .eq('is_active', true)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: 'Profile is not a staff member of this group' },
      { status: 400 }
    );
  }

  if (status === null) {
    const { error: delError } = await admin
      .from('attendance_records')
      .delete()
      .eq('session_id', sessionId)
      .eq('participant_id', profileId);
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
  } else {
    const { error: upsertError } = await admin
      .from('attendance_records')
      .upsert(
        {
          session_id: sessionId,
          participant_id: profileId,
          status,
          marked_by: user.id,
          marked_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,participant_id' }
      );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/madrich-attendance/session/:sessionId
 *
 * Body: { action: 'lock' | 'unlock' }
 *
 * Flips is_locked_staff on the session. Coordinators and admins only.
 * Independent from the chanichim-side is_locked flag.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'lock' && action !== 'unlock') {
    return NextResponse.json({ error: 'action must be "lock" or "unlock"' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('sessions')
    .select('id, group_id')
    .eq('id', sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const access = await requireGroupCoordinatorOrAdmin(user.id, session.group_id, admin);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await admin
    .from('sessions')
    .update({ is_locked_staff: action === 'lock' })
    .eq('id', sessionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, isLockedStaff: action === 'lock' });
}
