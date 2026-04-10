import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: membership } = await admin
      .from('group_memberships')
      .select('group_id')
      .eq('profile_id', user.id)
      .in('role', ['madrich', 'mazkirut'])
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'No group assigned' }, { status: 404 });
    }

    // Only show regular sessions in the madrich take-attendance flow.
    // Planning sessions don't have chanichim to mark.
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, session_date, is_locked, is_cancelled, attendance_records(count)')
      .eq('group_id', membership.group_id)
      .eq('is_cancelled', false)
      .neq('session_type', 'planning')
      .order('session_date', { ascending: false });

    const result = (sessions ?? []).map((s) => ({
      id: s.id,
      sessionDate: s.session_date,
      isLocked: s.is_locked,
      isCancelled: s.is_cancelled,
      attendanceCount: (s.attendance_records as { count: number }[])?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ sessions: result });
  } catch (err) {
    console.error('Madrich sessions error:', err);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}
