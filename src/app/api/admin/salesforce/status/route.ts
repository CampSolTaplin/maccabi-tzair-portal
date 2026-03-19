import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Verify caller is admin
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    // Fetch recent sync logs
    const { data: logs, error: logsError } = await adminClient
      .from('salesforce_sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (logsError) {
      return NextResponse.json(
        { error: `Failed to fetch logs: ${logsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ logs });
  } catch (err) {
    console.error('Salesforce status error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
