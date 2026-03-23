'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  Lock,
  CalendarOff,
  ChevronLeft,
  Calendar,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useGroupMembership } from '@/lib/hooks/use-group-membership';
import { useAvailableSessions, type AvailableSession } from '@/lib/hooks/use-available-sessions';

type Status = 'present' | 'late' | 'absent' | 'excused';

interface MemberEntry {
  id: string;
  firstName: string;
  lastName: string;
  status: Status | null;
  saving: boolean;
}

const statusConfig: {
  value: Status;
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  bg: string;
}[] = [
  { value: 'present', icon: CheckCircle2, label: 'Present', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { value: 'late', icon: Clock, label: 'Late', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  { value: 'absent', icon: XCircle, label: 'Absent', color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  { value: 'excused', icon: AlertCircle, label: 'Excused', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
];

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const d = new Date(dateStr + 'T12:00:00');
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

export default function TakeAttendancePage() {
  const { groupId, groupName, loading: groupLoading, error: groupError } = useGroupMembership();
  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useAvailableSessions(groupId);

  const [selectedSession, setSelectedSession] = useState<AvailableSession | null>(null);
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [locking, setLocking] = useState(false);
  const [locked, setLocked] = useState(false);

  // Auto-select today's session if available
  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) {
      const todaySession = sessions.find((s) => isToday(s.sessionDate) && !s.isLocked);
      if (todaySession) {
        setSelectedSession(todaySession);
      }
    }
  }, [sessions, selectedSession]);

  // Load participants when session is selected
  useEffect(() => {
    if (!groupId || !selectedSession) {
      setMembers([]);
      return;
    }

    const currentSession = selectedSession;

    async function loadData() {
      setLoadingMembers(true);
      const supabase = createClient();

      const { data: memberships } = await supabase
        .from('group_memberships')
        .select('profile_id, profiles(id, first_name, last_name)')
        .eq('group_id', groupId)
        .eq('role', 'participant')
        .eq('is_active', true);

      const { data: existingAttendance } = await supabase
        .from('attendance_records')
        .select('participant_id, status')
        .eq('session_id', currentSession.id);

      const attendanceMap = new Map(
        (existingAttendance ?? []).map((a) => [a.participant_id, a.status as Status])
      );

      const entries: MemberEntry[] = (memberships ?? [])
        .map((m) => {
          const profile = m.profiles as unknown as { id: string; first_name: string; last_name: string } | null;
          if (!profile) return null;
          return {
            id: profile.id,
            firstName: profile.first_name,
            lastName: profile.last_name,
            status: attendanceMap.get(profile.id) ?? null,
            saving: false,
          };
        })
        .filter((e): e is MemberEntry => e !== null)
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

      setMembers(entries);
      setLocked(currentSession.isLocked);
      setLoadingMembers(false);
    }

    loadData();
  }, [groupId, selectedSession]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedSession) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`attendance-${selectedSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `session_id=eq.${selectedSession.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const record = payload.new as { participant_id: string; status: Status };
            setMembers((prev) =>
              prev.map((m) =>
                m.id === record.participant_id
                  ? { ...m, status: record.status, saving: false }
                  : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSession]);

  const setStatus = useCallback(
    async (participantId: string, status: Status) => {
      if (!selectedSession || locked) return;

      setMembers((prev) =>
        prev.map((m) =>
          m.id === participantId
            ? { ...m, status: m.status === status ? null : status, saving: true }
            : m
        )
      );

      const newStatus = members.find((m) => m.id === participantId)?.status === status ? null : status;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (newStatus === null) {
        await supabase
          .from('attendance_records')
          .delete()
          .eq('session_id', selectedSession.id)
          .eq('participant_id', participantId);
      } else {
        await supabase
          .from('attendance_records')
          .upsert(
            {
              session_id: selectedSession.id,
              participant_id: participantId,
              status: newStatus,
              marked_by: user?.id,
            },
            { onConflict: 'session_id,participant_id' }
          );
      }

      setMembers((prev) =>
        prev.map((m) => (m.id === participantId ? { ...m, saving: false } : m))
      );
    },
    [selectedSession, locked, members]
  );

  async function handleLockAndSubmit() {
    if (!selectedSession) return;
    setLocking(true);
    try {
      const supabase = createClient();
      await supabase.from('sessions').update({ is_locked: true }).eq('id', selectedSession.id);
      setLocked(true);
      refetchSessions();
    } catch {
      // ignore
    } finally {
      setLocking(false);
    }
  }

  const filteredMembers = members.filter(
    (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase())
  );
  const markedCount = members.filter((m) => m.status !== null).length;
  const allMarked = markedCount === members.length && members.length > 0;

  // Loading
  if (groupLoading || sessionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-brand-navy" />
        <p className="mt-4 text-sm text-brand-muted">Loading...</p>
      </div>
    );
  }

  // No group
  if (groupError || !groupId) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <AlertCircle className="h-12 w-12 text-brand-muted/40 mx-auto" />
        <h2 className="mt-4 text-lg font-semibold text-brand-dark-text">No Group Assigned</h2>
        <p className="mt-2 text-sm text-brand-muted">
          You haven&apos;t been assigned to a group yet. Please contact an administrator.
        </p>
      </div>
    );
  }

  // No sessions at all
  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <CalendarOff className="h-12 w-12 text-brand-muted/40 mx-auto" />
        <h2 className="mt-4 text-lg font-semibold text-brand-dark-text">No Sessions Available</h2>
        <p className="mt-2 text-sm text-brand-muted">
          There are no sessions available for {groupName}. Contact an administrator.
        </p>
      </div>
    );
  }

  // SESSION PICKER — no session selected yet
  if (!selectedSession) {
    const unlocked = sessions.filter((s) => !s.isLocked);
    const lockedSessions = sessions.filter((s) => s.isLocked);

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md">
          <div className="flex items-center gap-3 mb-1">
            <Calendar className="h-7 w-7" />
            <h1 className="text-2xl font-bold">Take Attendance</h1>
          </div>
          <p className="text-white/70">{groupName}</p>
        </div>

        {unlocked.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">
              Open Sessions
            </h3>
            <div className="space-y-2">
              {unlocked.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-xl bg-white border p-4 shadow-sm transition-all hover:shadow-md hover:border-brand-navy/30 cursor-pointer text-left',
                    isToday(s.sessionDate) && 'border-brand-coral ring-2 ring-brand-coral/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex flex-col items-center justify-center',
                      isToday(s.sessionDate) ? 'bg-brand-coral/10 text-brand-coral' : 'bg-brand-navy/5 text-brand-navy'
                    )}>
                      <span className="text-[10px] font-medium uppercase">
                        {new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span className="text-lg font-bold leading-none">
                        {new Date(s.sessionDate + 'T12:00:00').getDate()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-brand-dark-text">
                        {formatShortDate(s.sessionDate)}
                        {isToday(s.sessionDate) && (
                          <span className="ml-2 text-xs font-semibold text-brand-coral">TODAY</span>
                        )}
                      </p>
                      {s.attendanceCount > 0 && (
                        <p className="text-xs text-brand-muted flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />{s.attendanceCount} marked
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-brand-muted rotate-180" />
                </button>
              ))}
            </div>
          </div>
        )}

        {lockedSessions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">
              Submitted Sessions
            </h3>
            <div className="space-y-2">
              {lockedSessions.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className="w-full flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 p-4 transition-all hover:bg-gray-100 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex flex-col items-center justify-center text-gray-500">
                      <span className="text-[10px] font-medium uppercase">
                        {new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span className="text-lg font-bold leading-none">
                        {new Date(s.sessionDate + 'T12:00:00').getDate()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600">{formatShortDate(s.sessionDate)}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Lock className="h-3 w-3" />Locked &middot; {s.attendanceCount} marked
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-gray-400 rotate-180" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ATTENDANCE VIEW — session selected
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back button */}
      <button
        onClick={() => { setSelectedSession(null); setMembers([]); setSearch(''); }}
        className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to sessions
      </button>

      {/* Header */}
      <div className={cn(
        'rounded-2xl p-6 text-white shadow-md',
        locked
          ? 'bg-gradient-to-br from-gray-500 to-gray-600'
          : 'bg-gradient-to-br from-brand-coral to-brand-coral/80'
      )}>
        <div className="flex items-center gap-3 mb-2">
          {locked ? <Lock className="h-7 w-7" /> : <ClipboardCheck className="h-7 w-7" />}
          <h1 className="text-2xl font-bold">
            {locked ? 'Attendance Submitted' : 'Take Attendance'}
          </h1>
        </div>
        <p className="text-white/80">{groupName} &middot; {formatSessionDate(selectedSession.sessionDate)}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-white transition-all duration-300"
              style={{ width: members.length > 0 ? `${(markedCount / members.length) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-sm font-medium">
            {markedCount}/{members.length}
          </span>
        </div>
      </div>

      {/* Locked banner */}
      {locked && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          This session has been locked. Attendance is read-only.
        </div>
      )}

      {/* Search */}
      {!loadingMembers && members.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
        </div>
      )}

      {/* Loading members */}
      {loadingMembers && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
        </div>
      )}

      {/* Member List */}
      <div className="space-y-3">
        {filteredMembers.map((member) => (
          <div key={member.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium text-brand-dark-text">
                {member.firstName} {member.lastName}
              </p>
              {member.saving && (
                <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {statusConfig.map((cfg) => {
                const Icon = cfg.icon;
                const isSelected = member.status === cfg.value;
                return (
                  <button
                    key={cfg.value}
                    onClick={() => setStatus(member.id, cfg.value)}
                    disabled={locked}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition-all',
                      isSelected
                        ? `${cfg.bg} ${cfg.color} border-current`
                        : 'border-gray-100 text-brand-muted hover:bg-gray-50',
                      locked && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      {!locked && members.length > 0 && (
        <button
          onClick={handleLockAndSubmit}
          disabled={!allMarked || locking}
          className={cn(
            'w-full rounded-xl py-4 text-center font-semibold text-white shadow-md transition-all',
            allMarked && !locking
              ? 'bg-brand-coral hover:bg-brand-coral/90 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed'
          )}
        >
          {locking ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </span>
          ) : allMarked ? (
            'Lock & Submit Attendance'
          ) : (
            `Mark ${members.length - markedCount} remaining`
          )}
        </button>
      )}
    </div>
  );
}
