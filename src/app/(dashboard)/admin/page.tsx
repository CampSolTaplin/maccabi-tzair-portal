'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  Users,
  UserCheck,
  Calendar,
  TrendingUp,
  Cake,
  Loader2,
} from 'lucide-react';

interface DashboardData {
  summary: {
    totalParticipants: number;
    totalMadrichim: number;
    totalGroups: number;
    totalSessions: number;
    overallAttendance: number;
  };
  birthdays: {
    firstName: string;
    lastName: string;
    birthdate: string;
    role: string;
    daysUntil: number;
    age: number;
    groupName: string | null;
  }[];
}

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-center text-red-700">
        Failed to load dashboard data. Please try again later.
      </div>
    );
  }

  const { summary, birthdays } = data;

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Participants */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-muted">Total Participants</p>
                <p className="mt-1 text-2xl font-bold text-brand-dark-text">
                  {summary.totalParticipants}
                </p>
              </div>
              <div className="rounded-xl bg-brand-navy/10 p-3">
                <Users className="h-6 w-6 text-brand-navy" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Madrichim */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-muted">Total Madrichim</p>
                <p className="mt-1 text-2xl font-bold text-brand-dark-text">
                  {summary.totalMadrichim}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <UserCheck className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-muted">Active Sessions</p>
                <p className="mt-1 text-2xl font-bold text-brand-dark-text">
                  {summary.totalSessions}
                </p>
              </div>
              <div className="rounded-xl bg-brand-light-blue/30 p-3">
                <Calendar className="h-6 w-6 text-brand-navy" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avg Attendance */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-muted">Avg Attendance</p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-bold',
                    summary.overallAttendance >= 70
                      ? 'text-emerald-600'
                      : summary.overallAttendance >= 50
                        ? 'text-amber-600'
                        : 'text-red-600'
                  )}
                >
                  {summary.overallAttendance}%
                </p>
              </div>
              <div
                className={cn(
                  'rounded-xl p-3',
                  summary.overallAttendance >= 70
                    ? 'bg-emerald-50'
                    : summary.overallAttendance >= 50
                      ? 'bg-amber-50'
                      : 'bg-red-50'
                )}
              >
                <TrendingUp
                  className={cn(
                    'h-6 w-6',
                    summary.overallAttendance >= 70
                      ? 'text-emerald-600'
                      : summary.overallAttendance >= 50
                        ? 'text-amber-600'
                        : 'text-red-600'
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Birthdays ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-navy">
            <Cake className="h-5 w-5" />
            Upcoming Birthdays
          </CardTitle>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="py-4 text-center text-sm text-brand-muted">
              No upcoming birthdays in the next 30 days
            </p>
          ) : (
            <div className="space-y-3">
              {birthdays.slice(0, 10).map((b, i) => (
                <div
                  key={`${b.firstName}-${b.lastName}-${i}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-4 py-3',
                    b.daysUntil === 0 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {b.daysUntil === 0 && (
                      <span className="text-lg">🎂</span>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-brand-dark-text">
                          {b.firstName} {b.lastName}
                        </span>
                        {b.daysUntil === 0 && (
                          <Badge variant="danger">TODAY!</Badge>
                        )}
                        {b.role === 'madrich' && (
                          <Badge variant="warning">MADRICH</Badge>
                        )}
                      </div>
                      <p className="text-xs text-brand-muted">
                        Turning {b.age}
                        {b.groupName ? ` \u00B7 ${b.groupName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {b.daysUntil === 0 ? (
                      <span className="text-sm font-semibold text-red-600">Today</span>
                    ) : (
                      <span className="text-sm text-brand-muted">
                        in {b.daysUntil} day{b.daysUntil !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
