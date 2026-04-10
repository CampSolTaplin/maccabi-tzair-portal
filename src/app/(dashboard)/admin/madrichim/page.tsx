'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
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
  Pencil,
  Save,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type UserRole = 'admin' | 'coordinator' | 'madrich' | 'mazkirut';

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

type FilterTab = 'all' | 'admin' | 'coordinator' | 'madrich' | 'mazkirut';
type SortMode = 'lastName' | 'firstName' | 'group';

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'lastName', label: 'Last name' },
  { key: 'firstName', label: 'First name' },
  { key: 'group', label: 'Assigned group' },
];

const AREA_COLORS: Record<string, string> = {
  katan: 'bg-blue-100 text-blue-700',
  noar: 'bg-purple-100 text-purple-700',
  leadership: 'bg-amber-100 text-amber-700',
};

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700', icon: Crown },
  coordinator: { label: 'Coordinator', color: 'bg-indigo-100 text-indigo-700', icon: UserCog },
  madrich: { label: 'Madrich', color: 'bg-emerald-100 text-emerald-700', icon: Shield },
  mazkirut: { label: 'Mazkirut', color: 'bg-rose-100 text-rose-700', icon: Shield },
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'admin', label: 'Admins' },
  { key: 'coordinator', label: 'Coordinators' },
  { key: 'madrich', label: 'Madrichim' },
  { key: 'mazkirut', label: 'Mazkirut' },
];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('madrich');
  const [resetAllState, setResetAllState] = useState<
    | { kind: 'idle' }
    | { kind: 'confirm1' }
    | { kind: 'confirm2' }
    | { kind: 'running' }
    | { kind: 'done'; total: number; succeeded: number; failed: number; errors: Array<{ label: string; error: string }> }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [seedPreSomState, setSeedPreSomState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | {
        kind: 'done';
        created: Array<{ name: string; phone: string }>;
        skipped: Array<{ name: string; phone: string; reason: string }>;
        failed: Array<{ name: string; reason: string }>;
      }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupIds, setNewGroupIds] = useState<string[]>([]);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [addingGroupTo, setAddingGroupTo] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ firstName: string; lastName: string; email: string; phone: string; role: UserRole }>({ firstName: '', lastName: '', email: '', phone: '', role: 'madrich' });
  const [editResult, setEditResult] = useState<{ userId: string; password?: string } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('lastName');
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
  const mazkirutUsers = allUsers.filter((u) => u.role === 'mazkirut');

  const filteredUsers = activeFilter === 'all'
    ? allUsers
    : allUsers.filter((u) => u.role === activeFilter);

  // Natural sort for group names so "2nd Grade" < "10th Grade"
  function compareUsers(a: UserRecord, b: UserRecord): number {
    const opts: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' };
    if (sortMode === 'firstName') {
      const byFirst = a.firstName.localeCompare(b.firstName, undefined, opts);
      return byFirst !== 0 ? byFirst : a.lastName.localeCompare(b.lastName, undefined, opts);
    }
    if (sortMode === 'group') {
      const aG = a.groups[0]?.groupName ?? '';
      const bG = b.groups[0]?.groupName ?? '';
      // Put users with no group last
      if (!aG && bG) return 1;
      if (aG && !bG) return -1;
      const byGroup = aG.localeCompare(bG, undefined, opts);
      if (byGroup !== 0) return byGroup;
      return a.lastName.localeCompare(b.lastName, undefined, opts);
    }
    // lastName (default)
    const byLast = a.lastName.localeCompare(b.lastName, undefined, opts);
    return byLast !== 0 ? byLast : a.firstName.localeCompare(b.firstName, undefined, opts);
  }

  const activeFiltered = filteredUsers.filter((u) => u.isActive).sort(compareUsers);
  const inactiveFiltered = filteredUsers.filter((u) => !u.isActive).sort(compareUsers);

  // Group active users by role for display (already sorted above, filter preserves order)
  const activeByRole: Record<string, typeof activeFiltered> = {
    admin: activeFiltered.filter((u) => u.role === 'admin'),
    coordinator: activeFiltered.filter((u) => u.role === 'coordinator'),
    madrich: activeFiltered.filter((u) => u.role === 'madrich'),
    mazkirut: activeFiltered.filter((u) => u.role === 'mazkirut'),
  };

  const createMutation = useMutation({
    mutationFn: async (body: { email?: string; phone?: string; firstName: string; lastName: string; role: UserRole; groupId?: string; groupIds?: string[] }) => {
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
      setNewPhone('');
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

  const editMutation = useMutation({
    mutationFn: async ({ profileId, ...fields }: { profileId: string; firstName: string; lastName: string; email: string; phone: string }) => {
      const res = await fetch('/api/admin/madrichim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, action: 'update_profile', ...fields }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      setEditingUser(null);
      if (data.authCreated && data.generatedPassword) {
        setEditResult({ userId: vars.profileId, password: data.generatedPassword });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  function startEditing(user: UserRecord) {
    setEditingUser(user.id);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: user.role,
    });
    setEditResult(null);
  }

  async function handleSaveEdit(user: UserRecord) {
    // If role changed, fire the change_role action first. We use mutateAsync
    // so we can wait for it before firing the profile update.
    if (editForm.role !== user.role) {
      try {
        await actionMutation.mutateAsync({
          profileId: user.id,
          action: 'change_role',
          role: editForm.role,
        });
      } catch {
        return; // actionMutation surfaces the error in its own state
      }
    }

    editMutation.mutate({
      profileId: user.id,
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      phone: editForm.phone,
    });
  }

  function handleCopyResetPassword() {
    if (resetPasswordResult) {
      navigator.clipboard.writeText(resetPasswordResult.password);
      setCopiedResetPassword(true);
      setTimeout(() => setCopiedResetPassword(false), 2000);
    }
  }

  function handleCreate() {
    if (!newFirst || !newLast) return;
    if (!newEmail && !newPhone) return;
    if (newRole === 'coordinator' || newRole === 'mazkirut') {
      if (newGroupIds.length === 0) return;
      createMutation.mutate({
        email: newEmail,
        phone: newPhone,
        firstName: newFirst,
        lastName: newLast,
        role: newRole,
        groupIds: newGroupIds,
      });
    } else if (newRole === 'madrich') {
      if (!newGroupId) return;
      createMutation.mutate({
        email: newEmail,
        phone: newPhone,
        firstName: newFirst,
        lastName: newLast,
        role: newRole,
        groupId: newGroupId,
      });
    } else {
      createMutation.mutate({
        email: newEmail,
        phone: newPhone,
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

  async function handleSeedPreSomMazkirut() {
    setSeedPreSomState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/seed-pre-som-mazkirut', {
        method: 'POST',
      });
      const body = await res.json();
      if (!res.ok) {
        setSeedPreSomState({
          kind: 'error',
          message: body?.error || 'Request failed',
        });
        return;
      }
      setSeedPreSomState({
        kind: 'done',
        created: body.created ?? [],
        skipped: body.skipped ?? [],
        failed: body.failed ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setSeedPreSomState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function handleResetAllPasswords() {
    setResetAllState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/reset-all-passwords', {
        method: 'POST',
      });
      const body = await res.json();
      if (!res.ok) {
        setResetAllState({
          kind: 'error',
          message: body?.error || 'Request failed',
        });
        return;
      }
      setResetAllState({
        kind: 'done',
        total: body.total ?? 0,
        succeeded: body.succeeded ?? 0,
        failed: body.failed ?? 0,
        errors: body.errors ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setResetAllState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  function handleExport() {
    const rows = allUsers.map((u) => {
      // Hide synthetic internal emails (phone-xxx@mtz.local) from the export
      const isSynthetic = !!u.email && u.email.endsWith('@mtz.local');
      return {
        'First Name': u.firstName,
        'Last Name': u.lastName,
        Role: ROLE_CONFIG[u.role]?.label ?? u.role,
        Email: isSynthetic ? '' : (u.email ?? ''),
        Phone: u.phone ?? '',
        Groups: u.groups.map((g) => g.groupName).join('; '),
        Areas: Array.from(new Set(u.groups.map((g) => g.groupArea).filter(Boolean))).join('; '),
        Active: u.isActive ? 'Yes' : 'No',
      };
    });

    // Sort: active first, then by role, then by last name
    rows.sort((a, b) => {
      if (a.Active !== b.Active) return a.Active === 'Yes' ? -1 : 1;
      if (a.Role !== b.Role) return a.Role.localeCompare(b.Role);
      return a['Last Name'].localeCompare(b['Last Name']);
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Set reasonable column widths
    ws['!cols'] = [
      { wch: 14 }, // First Name
      { wch: 16 }, // Last Name
      { wch: 12 }, // Role
      { wch: 32 }, // Email
      { wch: 14 }, // Phone
      { wch: 30 }, // Groups
      { wch: 18 }, // Areas
      { wch: 8 },  // Active
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `maccabi-tzair-users-${today}.xlsx`);
  }

  const needsGroup = newRole === 'madrich';
  const needsMultiGroup = newRole === 'coordinator' || newRole === 'mazkirut';
  const hasIdentifier = !!newEmail || !!newPhone;
  const canCreate = newFirst && newLast && hasIdentifier && (
    newRole === 'admin' ||
    (newRole === 'madrich' && newGroupId) ||
    ((newRole === 'coordinator' || newRole === 'mazkirut') && newGroupIds.length > 0)
  );

  const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20';

  function renderUserCard(user: UserRecord) {
    const config = ROLE_CONFIG[user.role];
    const RoleIcon = config.icon;
    const isEditing = editingUser === user.id;

    if (isEditing) {
      return (
        <Card key={user.id} className="border-brand-navy/30 shadow-sm">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-navy">Edit User</h4>
              <button onClick={() => setEditingUser(null)} className="text-brand-muted hover:text-brand-dark-text cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                placeholder="First name"
                value={editForm.firstName}
                onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Last name"
                value={editForm.lastName}
                onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Phone"
                value={editForm.phone}
                onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className={inputClass}
              />
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-brand-muted mb-1 uppercase tracking-wider">
                  Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className={inputClass}
                >
                  <option value="admin">Admin</option>
                  <option value="coordinator">Coordinator</option>
                  <option value="madrich">Madrich</option>
                  <option value="mazkirut">Mazkirut</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={editMutation.isPending || actionMutation.isPending || !editForm.firstName || !editForm.lastName}
                onClick={() => handleSaveEdit(user)}
              >
                {editMutation.isPending || actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              {editMutation.error && (
                <p className="text-xs text-red-600">{editMutation.error.message}</p>
              )}
              {actionMutation.error && (
                <p className="text-xs text-red-600">{actionMutation.error.message}</p>
              )}
              {!user.email && editForm.email && (
                <p className="text-xs text-amber-600">Adding email will create a login account with the default password.</p>
              )}
              {editForm.role !== user.role && (
                <p className="text-xs text-amber-600">
                  Role will change from {ROLE_CONFIG[user.role]?.label ?? user.role} to {ROLE_CONFIG[editForm.role]?.label ?? editForm.role}.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

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
                    <option value="mazkirut">Mazkirut</option>
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
            {(user.role === 'coordinator' || user.role === 'mazkirut') && user.isActive && (
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
                onClick={() => startEditing(user)}
                className="p-1.5 rounded-md text-brand-muted hover:text-brand-navy hover:bg-brand-navy/5 transition-colors cursor-pointer"
                title="Edit user"
              >
                <Pencil className="h-4 w-4" />
              </button>
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
          {/* Edit result banner (shows password when auth account was created) */}
          {editResult?.userId === user.id && editResult.password && (
            <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-emerald-800">Account created! Temporary password:</p>
                <code className="font-mono bg-white px-2 py-0.5 rounded text-emerald-900">{editResult.password}</code>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(editResult.password!);
                }}
                className="p-1.5 rounded hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Copy password"
              >
                <Clipboard className="h-4 w-4 text-emerald-600" />
              </button>
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={allUsers.length === 0}
            title="Download all users as an Excel file"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => { setShowCreate(!showCreate); setCreatedPassword(null); }}>
            {showCreate ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showCreate ? 'Cancel' : 'Add User'}
          </Button>
        </div>
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

      {/* Filter + sort */}
      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
            Sort by
          </span>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer',
                  sortMode === opt.key
                    ? 'bg-white text-brand-navy shadow-sm'
                    : 'text-brand-muted hover:text-brand-dark-text'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
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
                placeholder="Email (optional if phone given)"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Phone (e.g. (305) 555-1234)"
                type="tel"
                inputMode="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
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
                <option value="mazkirut">Mazkirut</option>
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
                    Default password: <code className="font-mono bg-white px-2 py-0.5 rounded">{createdPassword}</code>
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
                <p className="mt-1.5 text-xs text-emerald-700/80">
                  The user will be asked to choose a new password on their first login.
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

      {/* Active users grouped by role */}
      {!isLoading && activeFiltered.length > 0 && (
        <div className="space-y-6">
          {(activeFilter === 'all' ? (['admin', 'coordinator', 'madrich', 'mazkirut'] as UserRole[]) : [activeFilter as UserRole]).map((role) => {
            const usersInRole = activeByRole[role];
            if (!usersInRole || usersInRole.length === 0) return null;
            const config = ROLE_CONFIG[role];
            return (
              <div key={role}>
                <h3 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-3">
                  {role === 'admin' ? 'Administrators' : role === 'coordinator' ? 'Coordinators' : role === 'mazkirut' ? 'Mazkirut' : 'Madrichim'}
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

      {/* One-shot setup: Pre-SOM Mazkirut seed */}
      {!isLoading && !error && allUsers.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/40 mt-10">
          <CardContent className="py-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wider">
                One-shot setup
              </h3>
              <p className="text-sm text-emerald-900/80 mt-1">
                Create the 9 Pre-SOM mazkirut (Dan Berlagosky, Elizabeth
                Bakalarz, Ilana Levy, Joel Feldman, Maya Hunis, Mia Rebruj,
                Milla Szprynger, Noah Mizrachi, Valentina Chmielewski) and
                assign them to the Pre-SOM group. Safe to click more than
                once — anyone whose phone already exists is skipped.
              </p>
            </div>

            {seedPreSomState.kind === 'idle' && (
              <Button
                variant="outline"
                onClick={handleSeedPreSomMazkirut}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                Add Pre-SOM Mazkirut (9)
              </Button>
            )}

            {seedPreSomState.kind === 'running' && (
              <div className="flex items-center gap-2 text-sm text-emerald-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating users...
              </div>
            )}

            {seedPreSomState.kind === 'done' && (
              <div className="rounded-lg bg-white border border-emerald-200 px-4 py-3 text-sm space-y-2">
                <p className="font-semibold text-emerald-800">
                  Done. Created {seedPreSomState.created.length}, skipped{' '}
                  {seedPreSomState.skipped.length}, failed{' '}
                  {seedPreSomState.failed.length}.
                </p>
                <p className="text-emerald-700">
                  All new users share the default password{' '}
                  <code className="font-mono bg-emerald-50 px-1.5 py-0.5 rounded">
                    M@rjcc2026
                  </code>
                  . They will be prompted to change it on first login.
                </p>
                {seedPreSomState.created.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-emerald-700 mt-2">
                      Created:
                    </p>
                    <ul className="mt-1 text-xs text-emerald-900 list-disc list-inside">
                      {seedPreSomState.created.map((c, i) => (
                        <li key={i}>
                          {c.name} — {c.phone}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {seedPreSomState.skipped.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-700 mt-2">
                      Skipped:
                    </p>
                    <ul className="mt-1 text-xs text-amber-900 list-disc list-inside">
                      {seedPreSomState.skipped.map((s, i) => (
                        <li key={i}>
                          {s.name}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {seedPreSomState.failed.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-700 mt-2">
                      Failed:
                    </p>
                    <ul className="mt-1 text-xs text-red-900 list-disc list-inside">
                      {seedPreSomState.failed.map((f, i) => (
                        <li key={i}>
                          {f.name}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setSeedPreSomState({ kind: 'idle' })}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}

            {seedPreSomState.kind === 'error' && (
              <div className="rounded-lg bg-white border border-red-300 px-4 py-3 text-sm">
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-700 mt-1">{seedPreSomState.message}</p>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    onClick={() => setSeedPreSomState({ kind: 'idle' })}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger zone */}
      {!isLoading && !error && allUsers.length > 0 && (
        <Card className="border-red-200 bg-red-50/40 mt-10">
          <CardContent className="py-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider">
                Danger zone
              </h3>
              <p className="text-sm text-red-900/80 mt-1">
                Reset every user (admins, coordinators, madrichim, mazkirut) to
                the shared default password{' '}
                <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-200">
                  M@rjcc2026
                </code>
                . They will be forced to pick a new password on their next
                login. <strong>You will be affected too</strong> — make sure
                you know the default and have your MFA handy.
              </p>
            </div>

            {resetAllState.kind === 'idle' && (
              <Button
                variant="outline"
                onClick={() => setResetAllState({ kind: 'confirm1' })}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                Reset all passwords
              </Button>
            )}

            {resetAllState.kind === 'confirm1' && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-red-900">
                  This will reset ALL users. Are you sure?
                </p>
                <Button
                  variant="outline"
                  onClick={() => setResetAllState({ kind: 'confirm2' })}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  Yes, continue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setResetAllState({ kind: 'idle' })}
                >
                  Cancel
                </Button>
              </div>
            )}

            {resetAllState.kind === 'confirm2' && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-red-900">
                  Last chance — this is irreversible. Proceed?
                </p>
                <Button
                  onClick={handleResetAllPasswords}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Reset all now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setResetAllState({ kind: 'idle' })}
                >
                  Cancel
                </Button>
              </div>
            )}

            {resetAllState.kind === 'running' && (
              <div className="flex items-center gap-2 text-sm text-red-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetting all users...
              </div>
            )}

            {resetAllState.kind === 'done' && (
              <div className="rounded-lg bg-white border border-emerald-200 px-4 py-3 text-sm">
                <p className="font-semibold text-emerald-800">
                  Done. {resetAllState.succeeded} of {resetAllState.total} users
                  were reset.
                </p>
                {resetAllState.failed > 0 && (
                  <p className="text-red-700 mt-1">
                    {resetAllState.failed} failed. See details below.
                  </p>
                )}
                <p className="text-emerald-700 mt-1">
                  Everyone now has password{' '}
                  <code className="font-mono bg-emerald-50 px-1.5 py-0.5 rounded">
                    M@rjcc2026
                  </code>{' '}
                  and will be prompted to change it on next login.
                </p>
                {resetAllState.errors.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-red-700">
                    {resetAllState.errors.map((e, i) => (
                      <li key={i}>
                        {e.label}: {e.error}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <Button
                    variant="outline"
                    onClick={() => setResetAllState({ kind: 'idle' })}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}

            {resetAllState.kind === 'error' && (
              <div className="rounded-lg bg-white border border-red-300 px-4 py-3 text-sm">
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-700 mt-1">{resetAllState.message}</p>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    onClick={() => setResetAllState({ kind: 'idle' })}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
