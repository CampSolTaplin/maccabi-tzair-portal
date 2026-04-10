'use client';

import { useState, useMemo, useCallback, useEffect, use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Lock,
  Unlock,
  Loader2,
  Search,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Status = 'present' | 'late' | 'excused' | 'absent';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: 'madrich' | 'mazkirut';
}

interface SessionDetail {
  id: string;
  groupId: string;
  groupName: string;
  groupSlug: string;
  groupArea: string;
  sessionDate: string;
  sessionType: string;
  isLockedStaff: boolean;
  isCancelled: boolean;
  members: StaffMember[];
  marks: Record<string, Status>;
}

const STATUS_CONFIG: {
  value: Status;
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  bg: string;
}[] = [
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

export default function StaffAttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const queryClient = useQueryClient();

  // Fetch the full session detail (group + members + current marks)
  const { data: detail, isLoading, error, refetch } = useQuery<SessionDetail>({
    queryKey: ['staff-att-session', sessionId],
    queryFn: async () => {
      // 1. Look up the session's group via /api/admin/sessions (filtered to this session)
      //    Actually simpler: call /api/admin/madrich-attendance/session/[sessionId] which
      //    already returns marks. Then fetch group detail for members + session info.
      const marksRes = await fetch(`/api/admin/madrich-attendance/session/${sessionId}`);
      if (!marksRes.ok) throw new Error('Session not found');
      const marksBody = await marksRes.json();

      // We also need the group + member roster for this session. The admin/sessions
      // endpoint returns group info per session; use it to find ours.
      const sessRes = await fetch('/api/admin/sessions');
      if (!sessRes.ok) throw new Error('Failed to load sessions');
      const sessBody = await sessRes.json();
      const match = (sessBody.sessions ?? []).find(
        (s: { id: string }) => s.id === sessionId
      );
      if (!match) throw new Error('Session not in your scope');

      // Fetch the group's staff roster
      const rosterRes = await fetch(`/api/admin/madrich-attendance/${match.groupId}`);
      if (!rosterRes.ok) throw new Error('Failed to load roster');
      const rosterBody = await rosterRes.json();

      return {
        id: sessionId,
        groupId: match.groupId,
        groupName: match.groupName,
        groupSlug: match.groupSlug,
        groupArea: match.groupArea,
        sessionDate: match.sessionDate,
        sessionType: match.sessionType,
        isLockedStaff: !!marksBody.isLockedStaff,
        isCancelled: !!marksBody.isCancelled,
        members: rosterBody.members ?? [],
        marks: marksBody.marks ?? {},
      } as SessionDetail;
    },
  });

  const [localMarks, setLocalMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    if (detail?.marks) {
      setLocalMarks(detail.marks);
    }
  }, [detail?.marks]);

  const locked = !!detail?.isLockedStaff;
  const members = detail?.members ?? [];

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

  const markMember = useCallback(
    async (profileId: string, nextStatus: Status) => {
      if (locked) return;
      const previous = localMarks[profileId];
      setLocalMarks((m) => ({ ...m, [profileId]: nextStatus }));
      setSaving((s) => ({ ...s, [profileId]: true }));
      try {
        const res = await fetch(
          `/api/admin/madrich-attendance/session/${sessionId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, status: nextStatus }),
          }
        );
        if (!res.ok) throw new Error('save failed');
      } catch {
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
    [sessionId, locked, localMarks]
  );

  async function handleLock(lock: boolean) {
    setLocking(true);
    try {
      const res = await fetch(
        `/api/admin/madrich-attendance/session/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: lock ? 'lock' : 'unlock' }),
        }
      );
      if (!res.ok) throw new Error('lock failed');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['staff-att-sessions'] });
    } finally {
      setLocking(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertCircle className="h-10 w-10 text-brand-muted/40 mx-auto" />
        <p className="mt-3 text-sm text-brand-muted">
          {error instanceof Error ? error.message : 'Failed to load session.'}
        </p>
        <Link
          href="/admin/madrich-attendance"
          className="inline-flex items-center gap-1 mt-4 text-sm text-brand-navy hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Staff Attendance
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/madrich-attendance"
        className="flex items-center gap-1 text-sm text-brand-muted hover:text-brand-dark-text transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Staff Attendance
      </Link>

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
          {detail.groupName} · {formatSessionDate(detail.sessionDate)}
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

      {members.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-brand-muted">
              No madrichim or mazkirut assigned to this group.
            </p>
          </CardContent>
        </Card>
      )}

      {members.length > 0 && (
        <>
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
        </>
      )}
    </div>
  );
}
