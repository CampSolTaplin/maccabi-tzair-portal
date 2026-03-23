'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Loader2,
  AlertTriangle,
  UserPlus,
  X,
  Shield,
  Mail,
  Phone,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Madrich {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  groupId: string | null;
  groupName: string | null;
  groupArea: string | null;
  membershipActive: boolean;
}

interface GroupOption {
  id: string;
  name: string;
  area: string;
}

const AREA_COLORS: Record<string, string> = {
  katan: 'bg-blue-100 text-blue-700',
  noar: 'bg-purple-100 text-purple-700',
  leadership: 'bg-amber-100 text-amber-700',
};

export default function AdminMadrichimPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ madrichim: Madrich[] }>({
    queryKey: ['admin-madrichim'],
    queryFn: async () => {
      const res = await fetch('/api/admin/madrichim');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['admin-groups-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      const d = await res.json();
      return { groups: d.groups.map((g: { id: string; name: string; area: string }) => ({ id: g.id, name: g.name, area: g.area })) };
    },
  });

  const groups = groupsData?.groups ?? [];
  const madrichim = data?.madrichim ?? [];
  const active = madrichim.filter((m) => m.isActive);
  const inactive = madrichim.filter((m) => !m.isActive);

  const createMutation = useMutation({
    mutationFn: async (body: { email: string; firstName: string; lastName: string; groupId: string }) => {
      const res = await fetch('/api/admin/madrichim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedPassword(data.madrich.generatedPassword);
      setNewFirst('');
      setNewLast('');
      setNewEmail('');
      setNewGroupId('');
      queryClient.invalidateQueries({ queryKey: ['admin-madrichim'] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (body: { profileId: string; action: string; groupId?: string }) => {
      const res = await fetch('/api/admin/madrichim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      setReassigning(null);
      queryClient.invalidateQueries({ queryKey: ['admin-madrichim'] });
    },
  });

  function handleCreate() {
    if (!newFirst || !newLast || !newEmail || !newGroupId) return;
    createMutation.mutate({ email: newEmail, firstName: newFirst, lastName: newLast, groupId: newGroupId });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Madrichim</h2>
          <p className="mt-1 text-sm text-brand-muted">Manage group leaders and their assignments</p>
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setCreatedPassword(null); }}>
          {showCreate ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {showCreate ? 'Cancel' : 'Add Madrich'}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Shield className="h-5 w-5 text-brand-navy" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{active.length}</p>
              <p className="text-xs text-brand-muted">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">
                {new Set(active.filter((m) => m.groupId).map((m) => m.groupId)).size}
              </p>
              <p className="text-xs text-brand-muted">Groups covered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className={cn('h-5 w-5', inactive.length > 0 ? 'text-amber-500' : 'text-gray-300')} />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{inactive.length}</p>
              <p className="text-xs text-brand-muted">Inactive</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-brand-navy/20">
          <CardContent className="py-5 space-y-4">
            <h3 className="font-semibold text-brand-dark-text">Add New Madrich</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="First name"
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              />
              <input
                placeholder="Last name"
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              />
              <input
                placeholder="Email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              />
              <select
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              >
                <option value="">Select group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !newFirst || !newLast || !newEmail || !newGroupId}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create
              </Button>
              {createMutation.error && (
                <p className="text-sm text-red-600">{createMutation.error.message}</p>
              )}
            </div>
            {createdPassword && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm">
                <p className="font-semibold text-emerald-800">Madrich created!</p>
                <p className="text-emerald-700 mt-1">
                  Temporary password: <code className="font-mono bg-white px-2 py-0.5 rounded">{createdPassword}</code>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'Error'}</p>
          </CardContent>
        </Card>
      )}

      {/* Active madrichim */}
      {!isLoading && active.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">Active Madrichim</h3>
          <div className="space-y-2">
            {active.map((m) => (
              <Card key={m.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-brand-navy/10 flex items-center justify-center text-brand-navy font-bold text-sm flex-shrink-0">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-dark-text">
                        {m.firstName} {m.lastName}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-brand-muted">
                        {m.email && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span>
                        )}
                        {m.phone && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {reassigning === m.id ? (
                      <select
                        autoFocus
                        defaultValue={m.groupId ?? ''}
                        onChange={(e) => {
                          if (e.target.value && e.target.value !== m.groupId) {
                            actionMutation.mutate({ profileId: m.id, action: 'reassign', groupId: e.target.value });
                          } else {
                            setReassigning(null);
                          }
                        }}
                        onBlur={() => setReassigning(null)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                      >
                        <option value="">No group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setReassigning(m.id)}
                        className="cursor-pointer"
                        title="Click to reassign group"
                      >
                        {m.groupName ? (
                          <Badge className={cn('text-xs', AREA_COLORS[m.groupArea ?? ''] ?? 'bg-gray-100 text-gray-600')}>
                            {m.groupName}
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Badge>
                        ) : (
                          <Badge className="bg-red-50 text-red-600 text-xs">
                            No group <ChevronDown className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (confirm(`Deactivate ${m.firstName} ${m.lastName}?`)) {
                          actionMutation.mutate({ profileId: m.id, action: 'deactivate' });
                        }
                      }}
                      className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Deactivate"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Inactive */}
      {!isLoading && inactive.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">Inactive</h3>
          <div className="space-y-2">
            {inactive.map((m) => (
              <Card key={m.id} className="opacity-60">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-sm">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actionMutation.mutate({ profileId: m.id, action: 'reactivate' })}
                  >
                    Reactivate
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
