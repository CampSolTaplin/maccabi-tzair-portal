'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Lock,
  Unlock,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Status = 'present' | 'late' | 'excused' | 'absent';

interface GroupOption {
  id: string;
  name: string;
  slug: string;
  area: string | null;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: 'madrich' | 'mazkirut';
}

interface SessionRow {
  id: string;
  sessionDate: string;
  sessionType: string;
  title: string | null;
  isLocked: boolean;
  isLockedStaff: boolean;
}

interface GroupDetail {
  group: GroupOption;
  members: StaffMember[];
  sessions: SessionRow[];
}

interface SessionMarks {
  sessionId: string;
  isLockedStaff: boolean;
  isCancelled: boolean;
  marks: Record<string, Status>;
}

const STATUS_CONFIG: { value: Status; icon: typeof CheckCircle2; label: string; color: string; bg: string }[] = [
  { value: 'present', icon: CheckCircle2, label: 'Present', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { value: 'late', icon: Clock, label: 'Late', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  { value: 'excused', icon: AlertCircle, label: 'Excused', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
  { value: 'absent', icon: XCircle, label: 'Absent', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
];

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const d = new Date(dateStr + 'T12:00:00');
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export default function MadrichAttendancePage() {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [locking, setLocking] = useState(false);

  // List of groups the caller can manage
  const { data: groupsData, isLoading: loadingGroups } = useQuery<{
    groups: GroupOption[];
  }>({
    queryKey: ['staff-att-groups'],
    queryFn: async () => {
      const res = await fetch('/api/admin/madrich-attendance/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      return res.json();
    },
  });

  const groups = groupsData?.groups ?? [];

  // Group detail (members + sessions) for the selected group
  const { data: groupDetail, isLoading: loadingGroup } = useQuery<GroupDetail>({
    queryKey: ['staff-att-group', selectedGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/madrich-attendance/${selectedGroupId}`);
      if (!res.ok) throw new Error('Failed to load group');
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  // Session marks for the selected session
  const { data: sessionMarks, refetch: refetchMarks } = useQuery<SessionMarks>({
    queryKey: ['staff-att-marks', selectedSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/madrich-attendance/session/${selectedSessionId}`);
      if (!res.ok) throw new Error('Failed to load session marks');
      return res.json();
    },
    enabled: !!selectedSessionId,
  });

  // Local optimistic copy of marks so the UI updates instantly as the user clicks.
  const [localMarks, setLocalMarks] = useState<Record<string, Status>>({});
  useEffect(() => {
    if (sessionMarks?.marks) {
      setLocalMarks(sessionMarks.marks);
    }
  }, [sessionMarks?.marks]);

  const markMember = useCallback(
    async (profileId: string, nextStatus: Status) => {
      if (!selectedSessionId || sessionMarks?.isLockedStaff) return;
      const previous = localMarks[profileId];
      setLocalMarks((m) => ({ ...m, [profileId]: nextStatus }));
      setSaving((s) => ({ ...s, [profileId]: true }));
      try {
        const res = await fetch(
          `/api/admin/madrich-attendance/session/${selectedSessionId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, status: nextStatus }),
          }
        );
        if (!res.ok) throw new Error('save failed');
      } catch {
        // Revert on failure
        setLocalMarks((m) => {
          const next = { ...m };
          if (previous === undefined) delete next[profileId];
          else next[profileId] = previous;
          return next;
        });
      } finally {
        setSaving((s) => {
          const next = { ...s };
          delete next[profileId];
          return next;
        });
      }
    },
    [selectedSessionId, sessionMarks?.isLockedStaff, localMarks]
  );

  async function handleLock(lock: boolean) {
    if (!selectedSessionId) return;
    setLocking(true);
    try {
      const res = await fetch(
        `/api/admin/madrich-attendance/session/${selectedSessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: lock ? 'lock' : 'unlock' }),
        }
      );
      if (!res.ok) throw new Error('lock failed');
      await refetchMarks();
      queryClient.invalidateQueries({ queryKey: ['staff-att-group', selectedGroupId] });
    } finally {
      setLocking(false);
    }
  }

  const members = groupDetail?.members ?? [];
  const sessions = groupDetail?.sessions ?? [];

  const filteredMembers = useMemo(
    () =>
      members.filter((m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase())
      ),
    [members, search]
  );

  const markedCount = useMemo(
    () => members.filter((m) => localMarks[m.id] !== undefined).length,
    [members, localMarks]
  );

  const openSessions = sessions.filter((s) => !s.isLockedStaff);
  const lockedSessions = sessions.filter((s) => s.isLockedStaff);

  // ───────────────────────── Group picker ─────────────────────────
  if (!selectedGroupId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Staff Attendance</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Take attendance for madrichim and mazkirut. Pick a group to start.
          </p>
        </div>

        {loadingGroups ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-brand-muted/40" />
              <p className="mt-3 text-sm text-brand-muted">
                You don&apos;t coordinate any groups.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setSelectedGroupId(g.id);
                  setSelectedSessionId(null);
                  setSearch('');
                }}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-brand-navy/30 hover:shadow-md cursor-pointer"
              >
                <div>
                  <p className="font-semibold text-brand-dark-text">{g.name}</p>
                  {g.area && (
                    <p className="text-xs text-brand-muted uppercase tracking-wider mt-0.5">
                      {g.area}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-brand-muted" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────── Session picker ─────────────────────────
  if (!selectedSessionId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          onClick={() => setSelectedGroupId(null)}
          className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to groups
        </button>

        <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md">
          <div className="flex items-center gap-3 mb-1">
            <Calendar className="h-7 w-7" />
            <h1 className="text-2xl font-bold">Staff Attendance</h1>
          </div>
          <p className="text-white/70">{groupDetail?.group.name ?? '…'}</p>
        </div>

        {loadingGroup ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
          </div>
        ) : members.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-brand-muted/40" />
              <p className="mt-3 text-sm font-medium text-brand-muted">
                No madrichim or mazkirut in this group
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {openSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">
                  Open Sessions
                </h3>
                <div className="space-y-2">
                  {openSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-xl bg-white border p-4 shadow-sm transition-all hover:shadow-md hover:border-brand-navy/30 cursor-pointer text-left',
                        isToday(s.sessionDate) && 'border-brand-coral ring-2 ring-brand-coral/20'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-12 h-12 rounded-lg flex flex-col items-center justify-center',
                            isToday(s.sessionDate)
                              ? 'bg-brand-coral/10 text-brand-coral'
                              : 'bg-brand-navy/5 text-brand-navy'
                          )}
                        >
                          <span className="text-[10px] font-medium uppercase">
                            {new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                            })}
                          </span>
                          <span className="text-lg font-bold leading-none">
                            {new Date(s.sessionDate + 'T12:00:00').getDate()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-brand-dark-text">
                            {formatShortDate(s.sessionDate)}
                            {isToday(s.sessionDate) && (
                              <span className="ml-2 text-xs font-semibold text-brand-coral">
                                TODAY
                              </span>
                            )}
                          </p>
                          {s.sessionType !== 'regular' && (
                            <p className="text-xs text-brand-muted mt-0.5 capitalize">
                              {s.sessionType}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-brand-muted" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lockedSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">
                  Locked Sessions
                </h3>
                <div className="space-y-2">
                  {lockedSessions.slice(0, 10).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className="w-full flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 p-4 transition-all hover:bg-gray-100 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex flex-col items-center justify-center text-gray-400">
                          <span className="text-[10px] font-medium uppercase">
                            {new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                            })}
                          </span>
                          <span className="text-lg font-bold leading-none">
                            {new Date(s.sessionDate + 'T12:00:00').getDate()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-500">
                            {formatShortDate(s.sessionDate)}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <Lock className="h-3 w-3" />
                            Locked
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ───────────────────────── Mark attendance ─────────────────────────
  const locked = !!sessionMarks?.isLockedStaff;
  const currentSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={() => {
          setSelectedSessionId(null);
          setSearch('');
        }}
        className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to sessions
      </button>

      <div
        className={cn(
          'rounded-2xl p-6 text-white shadow-md',
          locked
            ? 'bg-gradient-to-br from-gray-500 to-gray-600'
            : 'bg-gradient-to-br from-brand-navy to-brand-navy/80'
        )}
      >
        <div className="flex items-center gap-3 mb-2">
          {locked ? <Lock className="h-7 w-7" /> : <ClipboardCheck className="h-7 w-7" />}
          <h1 className="text-2xl font-bold">
            {locked ? 'Staff Attendance (Locked)' : 'Staff Attendance'}
          </h1>
        </div>
        <p className="text-white/80">
          {groupDetail?.group.name}
          {currentSession && ' · ' + formatSessionDate(currentSession.sessionDate)}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-white transition-all duration-300"
              style={{
                width: members.length > 0 ? `${(markedCount / members.length) * 100}%` : '0%',
              }}
            />
          </div>
          <span className="text-sm font-medium">
            {markedCount}/{members.length}
          </span>
        </div>
      </div>

      {locked && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          This session is locked. Marks are read-only. Unlock to edit.
        </div>
      )}

      {members.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
        {filteredMembers.map((member) => {
          const current = localMarks[member.id];
          return (
            <div
              key={member.id}
              className="flex items-center justify-between py-2 px-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium text-sm text-brand-dark-text truncate">
                  {member.firstName} {member.lastName}
                </p>
                <Badge
                  className={cn(
                    'text-[9px] uppercase',
                    member.role === 'mazkirut'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  )}
                >
                  {member.role}
                </Badge>
                {saving[member.id] && (
                  <Loader2 className="h-3 w-3 animate-spin text-brand-muted flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                {STATUS_CONFIG.map((cfg) => {
                  const Icon = cfg.icon;
                  const isSelected = current === cfg.value;
                  return (
                    <button
                      key={cfg.value}
                      onClick={() => markMember(member.id, cfg.value)}
                      disabled={locked}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                        isSelected
                          ? `${cfg.bg} ${cfg.color} border-current`
                          : 'border-gray-200 text-brand-muted hover:bg-gray-50',
                        locked && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {members.length > 0 && (
        <button
          onClick={() => handleLock(!locked)}
          disabled={locking || (!locked && markedCount < members.length)}
          className={cn(
            'w-full rounded-xl py-4 text-center font-semibold text-white shadow-md transition-all',
            locked
              ? 'bg-brand-navy hover:bg-brand-navy/90 cursor-pointer'
              : markedCount === members.length && !locking
                ? 'bg-brand-coral hover:bg-brand-coral/90 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'
                : 'bg-gray-300 cursor-not-allowed'
          )}
        >
          {locking ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {locked ? 'Unlocking...' : 'Locking...'}
            </span>
          ) : locked ? (
            <span className="flex items-center justify-center gap-2">
              <Unlock className="h-4 w-4" />
              Unlock Session
            </span>
          ) : markedCount === members.length ? (
            <span className="flex items-center justify-center gap-2">
              <Lock className="h-4 w-4" />
              Lock &amp; Finalize
            </span>
          ) : (
            `Mark ${members.length - markedCount} remaining`
          )}
        </button>
      )}
    </div>
  );
}
