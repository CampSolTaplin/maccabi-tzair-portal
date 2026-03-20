import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = createAdminClient();

    let query = supabase
      .from('sessions')
      .select(`
        id, group_id, schedule_id, session_date, session_type, title,
        is_cancelled, is_locked, hours_present, hours_late,
        groups!inner(name, slug, area),
        attendance_records(count)
      `)
      .order('session_date', { ascending: true });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }
    if (from) {
      query = query.gte('session_date', from);
    }
    if (to) {
      query = query.lte('session_date', to);
    }

    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    // Flatten the response
    const result = (sessions ?? []).map((s) => ({
      id: s.id,
      groupId: s.group_id,
      groupName: (s.groups as unknown as Record<string, string>)?.name ?? '',
      groupSlug: (s.groups as unknown as Record<string, string>)?.slug ?? '',
      groupArea: (s.groups as unknown as Record<string, string>)?.area ?? '',
      sessionDate: s.session_date,
      sessionType: s.session_type,
      title: s.title,
      isCancelled: s.is_cancelled,
      isLocked: s.is_locked,
      hoursPresent: s.hours_present,
      hoursLate: s.hours_late,
      attendanceCount: (s.attendance_records as { count: number }[])?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ sessions: result });
  } catch (err) {
    console.error('Sessions fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, is_cancelled, is_locked } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const update: Record<string, unknown> = {};
    if (typeof is_cancelled === 'boolean') update.is_cancelled = is_cancelled;
    if (typeof is_locked === 'boolean') update.is_locked = is_locked;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('sessions')
      .update(update)
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Session update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    );
  }
}
