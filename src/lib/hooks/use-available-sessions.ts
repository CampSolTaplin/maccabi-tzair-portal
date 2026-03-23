'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AvailableSession {
  id: string;
  sessionDate: string;
  isLocked: boolean;
  isCancelled: boolean;
  attendanceCount: number;
}

interface AvailableSessionsResult {
  sessions: AvailableSession[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Returns all non-cancelled sessions for a group that are available for attendance.
 * Shows unlocked sessions (past and present) that the madrich can work on.
 */
export function useAvailableSessions(groupId: string | null): AvailableSessionsResult {
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
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
      setError(null);
      try {
        const supabase = createClient();

        const { data, error: queryError } = await supabase
          .from('sessions')
          .select('id, session_date, is_locked, is_cancelled, attendance_records(count)')
          .eq('group_id', groupId)
          .eq('is_cancelled', false)
          .order('session_date', { ascending: false });

        if (queryError) {
          setError('Failed to load sessions');
          return;
        }

        const result: AvailableSession[] = (data ?? []).map((s) => ({
          id: s.id,
          sessionDate: s.session_date,
          isLocked: s.is_locked,
          isCancelled: s.is_cancelled,
          attendanceCount: (s.attendance_records as { count: number }[])?.[0]?.count ?? 0,
        }));

        setSessions(result);
      } catch {
        setError('Failed to load sessions');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [groupId, refetchKey]);

  return {
    sessions,
    loading,
    error,
    refetch: () => setRefetchKey((k) => k + 1),
  };
}
