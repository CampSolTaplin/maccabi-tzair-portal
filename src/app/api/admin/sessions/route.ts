import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/supabase/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = createAdminClient();

    // Auth + coordinator filtering
    const auth = await getAuthContext(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { groupIds: authorizedGroupIds } = auth;

    let query = supabase
      .from('sessions')
      .select(`
        id, group_id, schedule_id, session_date, session_type, title,
        is_cancelled, is_locked, is_locked_staff, hours_present, hours_late,
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

    // Coordinator: only their assigned groups
    if (authorizedGroupIds) {
      query = query.in('group_id', authorizedGroupIds.length > 0 ? authorizedGroupIds : ['__none__']);
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
      isLockedStaff: s.is_locked_staff,
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
    const { sessionId, sessionIds, is_cancelled, is_locked, title } = await request.json();

    // Support single sessionId or batch sessionIds
    const ids: string[] = sessionIds ?? (sessionId ? [sessionId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'sessionId or sessionIds is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Auth + coordinator verification
    const auth = await getAuthContext(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Coordinator: verify all sessions belong to their groups
    if (auth.groupIds) {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, group_id')
        .in('id', ids);
      const unauthorized = (sessionData ?? []).filter(s => !auth.groupIds!.includes(s.group_id));
      if (unauthorized.length > 0) {
        return NextResponse.json({ error: 'Forbidden: not authorized for these sessions' }, { status: 403 });
      }
    }

    const update: Record<string, unknown> = {};
    if (typeof is_cancelled === 'boolean') update.is_cancelled = is_cancelled;
    if (typeof is_locked === 'boolean') update.is_locked = is_locked;
    if (typeof title === 'string') update.title = title || null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('sessions')
      .update(update)
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to update session(s): ${error.message}`);
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error('Session update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    );
  }
}
