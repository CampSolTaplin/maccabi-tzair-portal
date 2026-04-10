import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Cycle: null → present → late → excused → null (no absent — absence is implicit)
const STATUS_CYCLE = ['present', 'late', 'excused', null] as const;
const VALID_STATUSES = new Set([...STATUS_CYCLE]);

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, participantId, currentStatus } = body;
    const explicitNext = body.nextStatus;

    if (!sessionId || !participantId) {
      return NextResponse.json({ error: 'sessionId and participantId are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // If the caller passed an explicit nextStatus, honor it (used by the
    // mobile staff-attendance view where each P/L/E button sets a value
    // directly instead of cycling). Otherwise fall back to the cycle.
    let nextStatus: 'present' | 'late' | 'excused' | null;
    if (explicitNext !== undefined) {
      if (explicitNext !== null && !VALID_STATUSES.has(explicitNext)) {
        return NextResponse.json({ error: 'Invalid nextStatus' }, { status: 400 });
      }
      nextStatus = explicitNext;
    } else {
      const currentIdx = STATUS_CYCLE.indexOf(currentStatus ?? null);
      nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    }

    if (nextStatus === null) {
      // Remove the record
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('session_id', sessionId)
        .eq('participant_id', participantId);

      if (error) throw new Error(error.message);
    } else {
      // Upsert the record
      const { error } = await supabase
        .from('attendance_records')
        .upsert(
          {
            session_id: sessionId,
            participant_id: participantId,
            status: nextStatus,
            marked_at: new Date().toISOString(),
          },
          { onConflict: 'session_id,participant_id' }
        );

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true, newStatus: nextStatus });
  } catch (err) {
    console.error('Attendance toggle error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Toggle failed' },
      { status: 500 }
    );
  }
}
