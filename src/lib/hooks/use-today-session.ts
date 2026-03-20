'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

interface TodaySessionResult {
  sessionId: string | null;
  sessionDate: string | null;
  isLocked: boolean;
  isCancelled: boolean;
  noSession: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Given a group_id, returns today's session if it exists.
 */
export function useTodaySession(groupId: string | null): TodaySessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    async function fetch() {
      setLoading(true);
      try {
        const supabase = createClient();
        const today = format(new Date(), 'yyyy-MM-dd');

        const { data, error: queryError } = await supabase
          .from('sessions')
          .select('id, session_date, is_locked, is_cancelled')
          .eq('group_id', groupId)
          .eq('session_date', today)
          .limit(1)
          .maybeSingle();

        if (queryError) {
          setError('Failed to check session');
          return;
        }

        if (!data) {
          setNoSession(true);
          return;
        }

        setSessionId(data.id);
        setSessionDate(data.session_date);
        setIsLocked(data.is_locked);
        setIsCancelled(data.is_cancelled);
        setNoSession(data.is_cancelled);
      } catch {
        setError('Failed to load session');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [groupId, refetchKey]);

  return {
    sessionId,
    sessionDate,
    isLocked,
    isCancelled,
    noSession,
    loading,
    error,
    refetch: () => setRefetchKey((k) => k + 1),
  };
}
