'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
  Loader2,
  Users,
  Check,
} from 'lucide-react';

/* ─── Types ─── */

interface EventGroup {
  id: string;
  name: string;
  slug: string;
  area: string;
}

interface EventItem {
  id: string;
  name: string;
  description: string | null;
  eventDate: string;
  realHours: number;
  multiplier: number;
  createdAt: string;
  groups: EventGroup[];
  attendanceCount: number;
}

interface GroupOption {
  id: string;
  name: string;
  slug: string;
  area: string;
  description: string;
  memberCount: number;
}

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  attended: boolean | null;
}

/* ─── Helpers ─── */

function getAreaBadgeClasses(area: string): string {
  switch (area) {
    case 'katan':
      return 'bg-blue-50 text-blue-700';
    case 'noar':
      return 'bg-purple-50 text-purple-700';
    case 'leadership':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ─── Event Form ─── */

interface EventFormData {
  name: string;
  description: string;
  event_date: string;
  real_hours: number;
  multiplier: number;
  group_ids: string[];
}

function EventForm({
  initial,
  groups,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<EventFormData>;
  groups: GroupOption[];
  onSave: (data: EventFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventDate, setEventDate] = useState(initial?.event_date ?? '');
  const [realHours, setRealHours] = useState(initial?.real_hours ?? 1);
  const [multiplier, setMultiplier] = useState(initial?.multiplier ?? 1.0);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initial?.group_ids ?? []
  );

  function toggleGroup(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      description: description.trim(),
      event_date: eventDate,
      real_hours: realHours,
      multiplier,
      group_ids: selectedGroupIds,
    });
  }

  return (
    <Card className="border-brand-navy/20 border-2">
      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-brand-dark-text mb-1">
              Event Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy outline-none"
              placeholder="e.g. Shabbaton, Camp Day, etc."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-brand-dark-text mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy outline-none resize-none"
              placeholder="Optional description..."
            />
          </div>

          {/* Date, Hours, Multiplier row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-dark-text mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dark-text mb-1">
                Hours *
              </label>
              <input
                type="number"
                required
                min={0}
                step={0.5}
                value={realHours}
                onChange={(e) => setRealHours(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dark-text mb-1">
                Multiplier
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={multiplier}
                onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy outline-none"
              />
            </div>
          </div>

          {/* Groups multi-select */}
          <div>
            <label className="block text-sm font-medium text-brand-dark-text mb-2">
              Groups
            </label>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border',
                      selected
                        ? 'bg-brand-navy text-white border-brand-navy'
                        : 'bg-white text-brand-dark-text border-gray-300 hover:border-brand-navy/50'
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {g.name}
                  </button>
                );
              })}
            </div>
            {groups.length === 0 && (
              <p className="text-xs text-brand-muted">No groups available.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" size="sm" disabled={saving || !name.trim() || !eventDate}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Event'
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ─── Attendance Panel ─── */

function AttendancePanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ participants: Participant[] }>({
    queryKey: ['event-attendance', eventId],
    queryFn: () =>
      fetch(`/api/admin/events/${eventId}/attendance`).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch attendance');
        return r.json();
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ participantId, attended }: { participantId: string; attended: boolean }) =>
      fetch(`/api/admin/events/${eventId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, attended }),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to toggle attendance');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-attendance', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-2 text-sm text-brand-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading participants...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 px-2 text-sm text-red-600">
        Failed to load participants.
      </div>
    );
  }

  const participants = data?.participants ?? [];
  const attendedCount = participants.filter((p) => p.attended === true).length;

  if (participants.length === 0) {
    return (
      <div className="py-4 px-2 text-sm text-brand-muted">
        No participants found for the assigned groups.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-brand-muted">
          {attendedCount}/{participants.length} attended
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {participants.map((p) => {
          const isAttended = p.attended === true;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                toggleMutation.mutate({
                  participantId: p.id,
                  attended: !isAttended,
                })
              }
              disabled={toggleMutation.isPending}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors cursor-pointer',
                isAttended
                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-gray-50 text-brand-dark-text hover:bg-gray-100'
              )}
            >
              <span
                className={cn(
                  'flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                  isAttended
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 bg-white'
                )}
              >
                {isAttended && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">
                {p.lastName}, {p.firstName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Event Card ─── */

function EventCard({
  event,
  groups,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  groups: GroupOption[];
  onEdit: (event: EventItem) => void;
  onDelete: (eventId: string) => void;
}) {
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const effectiveHours = event.realHours * event.multiplier;

  // Count total participants from assigned groups
  const totalParticipants = event.groups.reduce((sum, eg) => {
    const group = groups.find((g) => g.id === eg.id);
    return sum + (group?.memberCount ?? 0);
  }, 0);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-brand-dark-text truncate">
              {event.name}
            </h3>
            {event.description && (
              <p className="text-sm text-brand-muted mt-0.5 line-clamp-2">
                {event.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(event)}
              title="Edit event"
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(event.id)}
              title="Delete event"
              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-brand-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(event.eventDate)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {event.realHours}h
            {event.multiplier !== 1 && (
              <span className="text-xs text-brand-navy font-medium">
                x{event.multiplier} = {effectiveHours}h
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {event.attendanceCount}/{totalParticipants} attended
          </span>
        </div>

        {/* Group badges */}
        {event.groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {event.groups.map((g) => (
              <Badge
                key={g.id}
                className={cn('text-[11px]', getAreaBadgeClasses(g.area))}
              >
                {g.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Take Attendance toggle */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setAttendanceOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-navy hover:text-brand-navy/80 transition-colors cursor-pointer"
          >
            <ClipboardCheck className="h-4 w-4" />
            Take Attendance
            {attendanceOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {attendanceOpen && (
            <div className="mt-3">
              <AttendancePanel eventId={event.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Skeleton ─── */

function EventCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-5 space-y-3">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="flex gap-3">
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="h-4 w-20 rounded bg-gray-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-gray-100" />
          <div className="h-5 w-16 rounded-full bg-gray-100" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */

export default function EventsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  // Fetch events
  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = useQuery<{ events: EventItem[] }>({
    queryKey: ['events'],
    queryFn: () =>
      fetch('/api/admin/events').then((r) => {
        if (!r.ok) throw new Error('Failed to fetch events');
        return r.json();
      }),
  });

  // Fetch groups for the form
  const { data: groupsData } = useQuery<{ groups: GroupOption[] }>({
    queryKey: ['groups'],
    queryFn: () =>
      fetch('/api/admin/groups').then((r) => {
        if (!r.ok) throw new Error('Failed to fetch groups');
        return r.json();
      }),
  });

  const events = eventsData?.events ?? [];
  const groups = groupsData?.groups ?? [];

  // Create event
  const createMutation = useMutation({
    mutationFn: (data: EventFormData) =>
      fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to create event');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowForm(false);
    },
  });

  // Update event
  const updateMutation = useMutation({
    mutationFn: (data: EventFormData & { eventId: string }) =>
      fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to update event');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setEditingEvent(null);
    },
  });

  // Delete event
  const deleteMutation = useMutation({
    mutationFn: (eventId: string) =>
      fetch('/api/admin/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to delete event');
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const handleCreate = useCallback(
    (data: EventFormData) => {
      createMutation.mutate(data);
    },
    [createMutation]
  );

  const handleUpdate = useCallback(
    (data: EventFormData) => {
      if (!editingEvent) return;
      updateMutation.mutate({ ...data, eventId: editingEvent.id });
    },
    [editingEvent, updateMutation]
  );

  const handleDelete = useCallback(
    (eventId: string) => {
      if (!confirm('Are you sure you want to delete this event? This will also remove all attendance records.')) {
        return;
      }
      deleteMutation.mutate(eventId);
    },
    [deleteMutation]
  );

  const handleEdit = useCallback((event: EventItem) => {
    setEditingEvent(event);
    setShowForm(false);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark-text">Events</h1>
          <p className="text-sm text-brand-muted mt-1">
            Create and manage special events, track attendance and community hours.
          </p>
        </div>
        {!showForm && !editingEvent && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <EventForm
          groups={groups}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Edit Form */}
      {editingEvent && (
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-brand-dark-text">
              Editing: {editingEvent.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingEvent(null)}
              className="text-brand-muted hover:text-brand-dark-text cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <EventForm
            initial={{
              name: editingEvent.name,
              description: editingEvent.description ?? '',
              event_date: editingEvent.eventDate,
              real_hours: editingEvent.realHours,
              multiplier: editingEvent.multiplier,
              group_ids: editingEvent.groups.map((g) => g.id),
            }}
            groups={groups}
            onSave={handleUpdate}
            onCancel={() => setEditingEvent(null)}
            saving={updateMutation.isPending}
          />
        </div>
      )}

      {/* Error state */}
      {eventsError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Failed to load events. Please try refreshing the page.
        </div>
      )}

      {/* Loading state */}
      {eventsLoading && (
        <div className="space-y-4">
          <EventCardSkeleton />
          <EventCardSkeleton />
          <EventCardSkeleton />
        </div>
      )}

      {/* Events list */}
      {!eventsLoading && !eventsError && events.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-10 w-10 text-brand-muted mx-auto mb-3" />
            <h3 className="text-base font-medium text-brand-dark-text">No events yet</h3>
            <p className="text-sm text-brand-muted mt-1">
              Create your first event to start tracking attendance.
            </p>
          </CardContent>
        </Card>
      )}

      {!eventsLoading && !eventsError && events.length > 0 && (
        <div className="space-y-4">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              groups={groups}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
