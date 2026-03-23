import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Cycle: null → present → late → excused → null (no absent — absence is implicit)
const STATUS_CYCLE = ['present', 'late', 'excused', null] as const;

export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, participantId, currentStatus } = await request.json();

    if (!sessionId || !participantId) {
      return NextResponse.json({ error: 'sessionId and participantId are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Find next status in cycle
    const currentIdx = STATUS_CYCLE.indexOf(currentStatus ?? null);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

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
