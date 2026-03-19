'use client';

import { useState } from 'react';
import {
  ClipboardCheck,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Status = 'present' | 'late' | 'absent' | 'excused' | null;

interface MemberEntry {
  id: string;
  name: string;
  status: Status;
}

const placeholderMembers: MemberEntry[] = [
  { id: '1', name: 'David Levy', status: null },
  { id: '2', name: 'Sarah Cohen', status: null },
  { id: '3', name: 'Daniel Mizrachi', status: null },
  { id: '4', name: 'Maya Goldstein', status: null },
  { id: '5', name: 'Eitan Ben-David', status: null },
  { id: '6', name: 'Noa Shapiro', status: null },
  { id: '7', name: 'Yael Rosenberg', status: null },
  { id: '8', name: 'Ari Friedman', status: null },
];

const statusConfig: { value: Status; icon: typeof CheckCircle2; label: string; color: string; bg: string }[] = [
  { value: 'present', icon: CheckCircle2, label: 'Present', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { value: 'late', icon: Clock, label: 'Late', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  { value: 'absent', icon: XCircle, label: 'Absent', color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  { value: 'excused', icon: AlertCircle, label: 'Excused', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
];

export default function TakeAttendancePage() {
  const [members, setMembers] = useState<MemberEntry[]>(placeholderMembers);
  const [search, setSearch] = useState('');

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const markedCount = members.filter((m) => m.status !== null).length;

  function setStatus(id: string, status: Status) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: m.status === status ? null : status } : m))
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-coral to-brand-coral/80 p-6 text-white shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardCheck className="h-7 w-7" />
          <h1 className="text-2xl font-bold">Take Attendance</h1>
        </div>
        <p className="text-white/80">{today}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-white transition-all duration-300"
              style={{ width: `${(markedCount / members.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium">
            {markedCount}/{members.length}
          </span>
        </div>
      </div>

      {/* Search */}
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

      {/* Member List */}
      <div className="space-y-3">
        {filteredMembers.map((member) => (
          <div
            key={member.id}
            className="rounded-xl bg-white p-4 shadow-sm"
          >
            <p className="mb-3 font-medium text-brand-dark-text">{member.name}</p>
            <div className="grid grid-cols-4 gap-2">
              {statusConfig.map((cfg) => {
                const Icon = cfg.icon;
                const isSelected = member.status === cfg.value;
                return (
                  <button
                    key={cfg.value}
                    onClick={() => setStatus(member.id, cfg.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition-all',
                      isSelected
                        ? `${cfg.bg} ${cfg.color} border-current`
                        : 'border-gray-100 text-brand-muted hover:bg-gray-50'
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
      <button
        disabled={markedCount < members.length}
        className={cn(
          'w-full rounded-xl py-4 text-center font-semibold text-white shadow-md transition-all',
          markedCount >= members.length
            ? 'bg-brand-coral hover:bg-brand-coral/90 hover:-translate-y-0.5 hover:shadow-lg'
            : 'bg-gray-300 cursor-not-allowed'
        )}
      >
        {markedCount >= members.length
          ? 'Submit Attendance'
          : `Mark ${members.length - markedCount} remaining`}
      </button>
    </div>
  );
}
