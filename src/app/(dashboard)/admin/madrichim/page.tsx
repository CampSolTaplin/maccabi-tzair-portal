'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  UserPlus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';

interface Madrich {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  groupId: string | null;
  groupName: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

export default function AdminMadrichimPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    groupId: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ madrichim: Madrich[] }>({
    queryKey: ['admin-madrichim'],
    queryFn: async () => {
      const res = await fetch('/api/admin/madrichim');
      if (!res.ok) throw new Error('Failed to load madrichim');
      return res.json();
    },
  });

  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['admin-groups-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/groups');
      if (!res.ok) throw new Error('Failed to load groups');
      const data = await res.json();
      return { groups: data.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })) };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/admin/madrichim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-madrichim'] });
      setFormSuccess(`Madrich ${result.madrich.firstName} ${result.madrich.lastName} created successfully!`);
      setFormData({ email: '', password: '', firstName: '', lastName: '', groupId: '' });
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to create madrich');
      setFormSuccess(null);
    },
  });

  const madrichim = data?.madrichim ?? [];
  const groups = groupsData?.groups ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName || !formData.groupId) {
      setFormError('All fields are required');
      return;
    }
    createMutation.mutate(formData);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Madrichim</h2>
          <p className="mt-1 text-sm text-brand-muted">
            Manage madrich accounts and group assignments
          </p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setFormError(null); setFormSuccess(null); }}>
          {showForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add Madrich'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Madrich</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-dark-text mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-dark-text mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-dark-text mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                    placeholder="madrich@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-dark-text mb-1">Password</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                    placeholder="Temporary password"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-dark-text mb-1">Assigned Group</label>
                <select
                  value={formData.groupId}
                  onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  <option value="">Select a group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {formSuccess}
                </div>
              )}

              <Button type="submit" loading={createMutation.isPending}>
                Create Madrich Account
              </Button>
            </form>
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

      {/* Madrichim list */}
      {!isLoading && !error && (
        <Card>
          <CardContent className="py-4">
            {madrichim.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="h-12 w-12 text-brand-muted/40" />
                <p className="mt-3 text-sm font-medium text-brand-muted">No madrichim yet</p>
                <p className="text-xs text-brand-muted mt-1">Click &quot;Add Madrich&quot; to create the first one</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {madrichim.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-brand-dark-text">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="text-xs text-brand-muted">{m.email}</p>
                    </div>
                    <Badge className="bg-brand-navy/10 text-brand-navy">
                      {m.groupName ?? 'No group'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
