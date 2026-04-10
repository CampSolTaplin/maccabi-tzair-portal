import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateSessionRows } from '@/lib/attendance/generate-sessions';

export async function POST(request: NextRequest) {
  try {
    const { seasonStart, seasonEnd } = await request.json();

    if (!seasonStart || !seasonEnd) {
      return NextResponse.json(
        { error: 'seasonStart and seasonEnd are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch all active schedules
    const { data: schedules, error: schedError } = await supabase
      .from('schedules')
      .select('id, group_id, day_of_week, session_type')
      .eq('is_active', true);

    if (schedError) {
      throw new Error(`Failed to fetch schedules: ${schedError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ created: 0, message: 'No active schedules found' });
    }

    // Generate session rows
    const sessions = generateSessionRows(schedules, seasonStart, seasonEnd);

    if (sessions.length === 0) {
      return NextResponse.json({ created: 0, message: 'No sessions to generate for this range' });
    }

    // Bulk insert with ON CONFLICT DO NOTHING (idempotent)
    // Supabase upsert with ignoreDuplicates
    const { data: inserted, error: insertError } = await supabase
      .from('sessions')
      .upsert(sessions, { onConflict: 'group_id,session_date', ignoreDuplicates: true })
      .select('id');

    if (insertError) {
      throw new Error(`Failed to insert sessions: ${insertError.message}`);
    }

    return NextResponse.json({
      created: inserted?.length ?? 0,
      totalGenerated: sessions.length,
    });
  } catch (err) {
    console.error('Session generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
