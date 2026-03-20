import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSalesforceEnrich } from '@/lib/salesforce/sync';

export async function POST() {
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

    // Run enrich
    const result = await runSalesforceEnrich(user.id);

    return NextResponse.json({ result });
  } catch (err) {
    console.error('Salesforce enrich error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrich failed' },
      { status: 500 }
    );
  }
}
