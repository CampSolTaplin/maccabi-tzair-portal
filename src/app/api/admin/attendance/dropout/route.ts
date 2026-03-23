import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest) {
  try {
    const { participantId, groupId, isDropout } = await request.json();

    if (!participantId || !groupId || typeof isDropout !== 'boolean') {
      return NextResponse.json({ error: 'participantId, groupId, and isDropout are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Update group_membership is_active (dropout = inactive)
    const { error: memErr } = await supabase
      .from('group_memberships')
      .update({ is_active: !isDropout })
      .eq('profile_id', participantId)
      .eq('group_id', groupId)
      .eq('role', 'participant');

    if (memErr) throw new Error(memErr.message);

    // Also update profile is_active
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ is_active: !isDropout })
      .eq('id', participantId);

    if (profErr) throw new Error(profErr.message);

    return NextResponse.json({ success: true, isDropout });
  } catch (err) {
    console.error('Dropout toggle error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to toggle dropout' },
      { status: 500 }
    );
  }
}
