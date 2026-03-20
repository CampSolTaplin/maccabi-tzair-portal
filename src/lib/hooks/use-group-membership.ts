'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface GroupMembershipResult {
  groupId: string | null;
  groupName: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Returns the current user's active madrich group membership.
 */
export function useGroupMembership(): GroupMembershipResult {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data, error: queryError } = await supabase
          .from('group_memberships')
          .select('group_id, groups(name)')
          .eq('profile_id', user.id)
          .eq('role', 'madrich')
          .eq('is_active', true)
          .limit(1)
          .single();

        if (queryError) {
          setError('No group assigned');
          return;
        }

        setGroupId(data.group_id);
        setGroupName((data.groups as unknown as { name: string } | null)?.name ?? null);
      } catch {
        setError('Failed to load group');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return { groupId, groupName, loading, error };
}
