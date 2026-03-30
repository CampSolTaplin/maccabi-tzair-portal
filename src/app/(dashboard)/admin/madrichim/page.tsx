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
  Crown,
  Clipboard,
  Check,
  UserCog,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type UserRole = 'admin' | 'coordinator' | 'madrich';

interface UserGroupInfo {
  groupId: string;
  groupName: string;
  groupArea: string | null;
}

interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  groupId: string | null;
  groupName: string | null;
  groupArea: string | null;
  membershipActive: boolean;
  groups: UserGroupInfo[];
}

interface GroupOption {
  id: string;
  name: string;
  area: string;
}

type FilterTab = 'all' | 'admin' | 'coordinator' | 'madrich';

const AREA_COLORS: Record<string, string> = {
  katan: 'bg-blue-100 text-blue-700',
  noar: 'bg-purple-100 text-purple-700',
  leadership: 'bg-amber-100 text-amber-700',
};

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700', icon: Crown },
  coordinator: { label: 'Coordinator', color: 'bg-indigo-100 text-indigo-700', icon: UserCog },
  madrich: { label: 'Madrich', color: 'bg-emerald-100 text-emerald-700', icon: Shield },
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'admin', label: 'Admins' },
  { key: 'coordinator', label: 'Coordinators' },
  { key: 'madrich', label: 'Madrichim' },
];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('madrich');
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupIds, setNewGroupIds] = useState<string[]>([]);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [addingGroupTo, setAddingGroupTo] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [resetPasswordResult, setResetPasswordResult] = useState<{ userId: string; password: string } | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  const { data, isLoading, error } = useQuery<{ users: UserRecord[] }>({
    queryKey: ['admin-users'],
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
  const allUsers = data?.users ?? [];

  const admins = allUsers.filter((u) => u.role === 'admin');
  const coordinators = allUsers.filter((u) => u.role === 'coordinator');
  const madrichim = allUsers.filter((u) => u.role === 'madrich');

  const filteredUsers = activeFilter === 'all'
    ? allUsers
    : allUsers.filter((u) => u.role === activeFilter);

  const activeFiltered = filteredUsers.filter((u) => u.isActive);
  const inactiveFiltered = filteredUsers.filter((u) => !u.isActive);

  // Group active users by role for display
  const activeByRole = {
    admin: activeFiltered.filter((u) => u.role === 'admin'),
    coordinator: activeFiltered.filter((u) => u.role === 'coordinator'),
    madrich: activeFiltered.filter((u) => u.role === 'madrich'),
  };

  const createMutation = useMutation({
    mutationFn: async (body: { email: string; firstName: string; lastName: string; role: UserRole; groupId?: string; groupIds?: string[] }) => {
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
      setCopiedPassword(false);
      setNewFirst('');
      setNewLast('');
      setNewEmail('');
      setNewRole('madrich');
      setNewGroupId('');
      setNewGroupIds([]);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (body: { profileId: string; action: string; groupId?: string; role?: string }) => {
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
      setChangingRole(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const res = await fetch('/api/admin/madrichim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, action: 'reset_password' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reset password');
      }
      return res.json();
    },
    onSuccess: (data, profileId) => {
      setResetPasswordResult({ userId: profileId, password: data.generatedPassword });
      setCopiedResetPassword(false);
    },
  });

  function handleCopyResetPassword() {
    if (resetPasswordResult) {
      navigator.clipboard.writeText(resetPasswordResult.password);
      setCopiedResetPassword(true);
      setTimeout(() => setCopiedResetPassword(false), 2000);
    }
  }

  function handleCreate() {
    if (!newFirst || !newLast || !newEmail) return;
    if (newRole === 'coordinator') {
      if (newGroupIds.length === 0) return;
      createMutation.mutate({
        email: newEmail,
        firstName: newFirst,
        lastName: newLast,
        role: newRole,
        groupIds: newGroupIds,
      });
    } else if (newRole === 'madrich') {
      if (!newGroupId) return;
      createMutation.mutate({
        email: newEmail,
        firstName: newFirst,
        lastName: newLast,
        role: newRole,
        groupId: newGroupId,
      });
    } else {
      createMutation.mutate({
        email: newEmail,
        firstName: newFirst,
        lastName: newLast,
        role: newRole,
      });
    }
  }

  function handleCopyPassword() {
    if (createdPassword) {
      navigator.clipboard.writeText(createdPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  }

  const needsGroup = newRole === 'madrich';
  const needsMultiGroup = newRole === 'coordinator';
  const canCreate = newFirst && newLast && newEmail && (
    newRole === 'admin' ||
    (newRole === 'madrich' && newGroupId) ||
    (newRole === 'coordinator' && newGroupIds.length > 0)
  );

  const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20';

  function renderUserCard(user: UserRecord) {
    const config = ROLE_CONFIG[user.role];
    const RoleIcon = config.icon;

    return (
      <Card key={user.id} className={cn('hover:shadow-sm transition-shadow', !user.isActive && 'opacity-60')}>
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
              user.isActive ? 'bg-brand-navy/10 text-brand-navy' : 'bg-gray-100 text-gray-400'
            )}>
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('font-semibold', user.isActive ? 'text-brand-dark-text' : 'text-gray-500')}>
                  {user.firstName} {user.lastName}
                </p>
                {changingRole === user.id ? (
                  <select
                    autoFocus
                    defaultValue={user.role}
                    onChange={(e) => {
                      const newR = e.target.value as UserRole;
                      if (newR !== user.role) {
                        actionMutation.mutate({ profileId: user.id, action: 'change_role', role: newR });
                      } else {
                        setChangingRole(null);
                      }
                    }}
                    onBlur={() => setChangingRole(null)}
                    className="rounded-md border border-gray-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                  >
                    <option value="admin">Admin</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="madrich">Madrich</option>
                  </select>
                ) : (
                  <button
                    onClick={() => setChangingRole(user.id)}
                    className="cursor-pointer"
                    title="Click to change role"
                  >
                    <Badge className={cn('text-xs', config.color)}>
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-brand-muted">
                {user.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
                )}
                {user.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Group badges — coordinator: multi-group; madrich: single */}
            {user.role === 'coordinator' && user.isActive && (
              <div className="flex items-center gap-1 flex-wrap">
                {(user.groups ?? []).map((g) => (
                  <Badge
                    key={g.groupId}
                    className={cn('text-xs cursor-pointer', AREA_COLORS[g.groupArea ?? ''] ?? 'bg-gray-100 text-gray-600')}
                    onClick={() => {
                      if (confirm(`Remove ${user.firstName} from ${g.groupName}?`)) {
                        actionMutation.mutate({ profileId: user.id, action: 'remove_group', groupId: g.groupId });
                      }
                    }}
                    title={`Click to remove from ${g.groupName}`}
                  >
                    {g.groupName}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
                {(user.groups ?? []).length === 0 && (
                  <Badge className="bg-red-50 text-red-600 text-xs">No groups</Badge>
                )}
                {addingGroupTo === user.id ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        actionMutation.mutate({ profileId: user.id, action: 'add_group', groupId: e.target.value });
                      }
                      setAddingGroupTo(null);
                    }}
                    onBlur={() => setAddingGroupTo(null)}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                  >
                    <option value="">Add group...</option>
                    {groups
                      .filter((g) => !(user.groups ?? []).some((ug) => ug.groupId === g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setAddingGroupTo(user.id)}
                    className="p-0.5 rounded-md text-brand-muted hover:text-brand-navy hover:bg-brand-navy/5 transition-colors cursor-pointer"
                    title="Add group"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            {user.role === 'madrich' && user.isActive && (
              <>
                {reassigning === user.id ? (
                  <select
                    autoFocus
                    defaultValue={user.groupId ?? ''}
                    onChange={(e) => {
                      if (e.target.value && e.target.value !== user.groupId) {
                        actionMutation.mutate({ profileId: user.id, action: 'reassign', groupId: e.target.value });
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
                    onClick={() => setReassigning(user.id)}
                    className="cursor-pointer"
                    title="Click to reassign group"
                  >
                    {user.groupName ? (
                      <Badge className={cn('text-xs', AREA_COLORS[user.groupArea ?? ''] ?? 'bg-gray-100 text-gray-600')}>
                        {user.groupName}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-600 text-xs">
                        No group <ChevronDown className="h-3 w-3 ml-1" />
                      </Badge>
                    )}
                  </button>
                )}
              </>
            )}

            {user.isActive && (
              <button
                onClick={() => {
                  if (confirm(`Reset password for ${user.firstName} ${user.lastName}?`)) {
                    resetPasswordMutation.mutate(user.id);
                  }
                }}
                disabled={resetPasswordMutation.isPending}
                className="p-1.5 rounded-md text-brand-muted hover:text-brand-navy hover:bg-brand-navy/5 transition-colors cursor-pointer disabled:opacity-50"
                title="Reset password"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            )}
            {user.isActive ? (
              <button
                onClick={() => {
                  if (confirm(`Deactivate ${user.firstName} ${user.lastName}?`)) {
                    actionMutation.mutate({ profileId: user.id, action: 'deactivate' });
                  }
                }}
                className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Deactivate"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actionMutation.mutate({ profileId: user.id, action: 'reactivate' })}
              >
                Reactivate
              </Button>
            )}
            <button
              onClick={() => {
                if (confirm(`PERMANENTLY DELETE ${user.firstName} ${user.lastName}? This cannot be undone.`)) {
                  if (confirm(`Are you sure? This will remove all data for ${user.firstName} ${user.lastName}.`)) {
                    actionMutation.mutate({ profileId: user.id, action: 'delete' });
                  }
                }
              }}
              className="p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Permanently delete user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {/* Reset password result banner */}
          {resetPasswordResult?.userId === user.id && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-amber-800">New temporary password:</p>
                <code className="font-mono bg-white px-2 py-0.5 rounded text-amber-900">{resetPasswordResult.password}</code>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyResetPassword}
                  className="p-1.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                  title="Copy password"
                >
                  {copiedResetPassword ? (
                    <Check className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Clipboard className="h-4 w-4 text-amber-600" />
                  )}
                </button>
                <button
                  onClick={() => setResetPasswordResult(null)}
                  className="p-1.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4 text-amber-400" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Users</h2>
          <p className="mt-1 text-sm text-brand-muted">Manage administrators, coordinators, and madrichim</p>
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setCreatedPassword(null); }}>
          {showCreate ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {showCreate ? 'Cancel' : 'Add User'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-5 w-5 text-brand-navy" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{allUsers.filter((u) => u.isActive).length}</p>
              <p className="text-xs text-brand-muted">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Crown className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{admins.filter((u) => u.isActive).length}</p>
              <p className="text-xs text-brand-muted">Admins</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <UserCog className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{coordinators.filter((u) => u.isActive).length}</p>
              <p className="text-xs text-brand-muted">Coordinators</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Shield className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold text-brand-dark-text">{madrichim.filter((u) => u.isActive).length}</p>
              <p className="text-xs text-brand-muted">Madrichim</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer',
              activeFilter === tab.key
                ? 'bg-white text-brand-navy shadow-sm'
                : 'text-brand-muted hover:text-brand-dark-text'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-brand-navy/20">
          <CardContent className="py-5 space-y-4">
            <h3 className="font-semibold text-brand-dark-text">Add New User</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="First name"
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Last name"
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={inputClass}
              />
              <select
                value={newRole}
                onChange={(e) => {
                  setNewRole(e.target.value as UserRole);
                  setNewGroupId('');
                  setNewGroupIds([]);
                }}
                className={inputClass}
              >
                <option value="admin">Admin</option>
                <option value="coordinator">Coordinator</option>
                <option value="madrich">Madrich</option>
              </select>
              {needsGroup && (
                <select
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              {needsMultiGroup && (
                <div className="sm:col-span-2 rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-brand-muted mb-2">Assign groups:</p>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => {
                      const selected = newGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setNewGroupIds(selected
                              ? newGroupIds.filter((id) => id !== g.id)
                              : [...newGroupIds, g.id]
                            );
                          }}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                            selected
                              ? 'bg-brand-navy text-white border-brand-navy'
                              : 'bg-white text-brand-muted border-gray-200 hover:border-brand-navy/40'
                          )}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                  {newGroupIds.length > 0 && (
                    <p className="text-xs text-brand-muted mt-2">{newGroupIds.length} group(s) selected</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !canCreate}
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
                <p className="font-semibold text-emerald-800">User created!</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-emerald-700">
                    Temporary password: <code className="font-mono bg-white px-2 py-0.5 rounded">{createdPassword}</code>
                  </p>
                  <button
                    onClick={handleCopyPassword}
                    className="p-1 rounded hover:bg-emerald-100 transition-colors cursor-pointer"
                    title="Copy password"
                  >
                    {copiedPassword ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Clipboard className="h-4 w-4 text-emerald-600" />
                    )}
                  </button>
                </div>
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

      {/* Active users grouped by role */}
      {!isLoading && activeFiltered.length > 0 && (
        <div className="space-y-6">
          {(activeFilter === 'all' ? (['admin', 'coordinator', 'madrich'] as UserRole[]) : [activeFilter as UserRole]).map((role) => {
            const usersInRole = activeByRole[role];
            if (!usersInRole || usersInRole.length === 0) return null;
            const config = ROLE_CONFIG[role];
            return (
              <div key={role}>
                <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">
                  {role === 'admin' ? 'Administrators' : role === 'coordinator' ? 'Coordinators' : 'Madrichim'}
                  {' '}({usersInRole.length})
                </h3>
                <div className="space-y-2">
                  {usersInRole.map((u) => renderUserCard(u))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inactive */}
      {!isLoading && inactiveFiltered.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Inactive ({inactiveFiltered.length})
          </h3>
          <div className="space-y-2">
            {inactiveFiltered.map((u) => renderUserCard(u))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && allUsers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-brand-muted">No users found. Create your first user above.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
