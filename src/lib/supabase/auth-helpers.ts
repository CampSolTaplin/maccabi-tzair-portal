import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get the current user's profile (role) and their authorized group IDs.
 * - Admin: returns null for groupIds (meaning all groups)
 * - Coordinator: returns array of assigned group IDs
 * - Others: returns empty array (no access)
 */
export async function getAuthContext(supabase: ReturnType<typeof createAdminClient>) {
  const authClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return { error: 'Unauthorized' as const, status: 401 as const };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'coordinator'].includes(profile.role)) {
    return { error: 'Forbidden' as const, status: 403 as const };
  }

  // Admin gets access to everything
  if (profile.role === 'admin') {
    return { user, role: 'admin' as const, groupIds: null };
  }

  // Coordinator gets access to assigned groups only
  const { data: memberships } = await supabase
    .from('group_memberships')
    .select('group_id')
    .eq('profile_id', user.id)
    .eq('role', 'coordinator')
    .eq('is_active', true);

  const groupIds = (memberships ?? []).map((m) => m.group_id);

  return { user, role: 'coordinator' as const, groupIds };
}
