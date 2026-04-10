import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/supabase/auth-helpers';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Auth + coordinator filtering — only show events a coordinator can
    // actually see.
    const auth = await getAuthContext(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Fetch all events with their groups and attendance count
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, name, description, event_date, real_hours, multiplier, created_at,
        event_groups(
          group_id,
          groups(id, name, slug, area)
        ),
        event_attendance(count)
      `)
      .order('event_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch events: ${error.message}`);
    }

    let result = (events ?? []).map((e) => {
      const groups = (
        e.event_groups as unknown as Array<{
          group_id: string;
          groups: { id: string; name: string; slug: string; area: string } | null;
        }>
      )
        .map((eg) => eg.groups)
        .filter(Boolean) as Array<{ id: string; name: string; slug: string; area: string }>;

      return {
        id: e.id,
        name: e.name,
        description: e.description,
        eventDate: e.event_date,
        realHours: e.real_hours,
        multiplier: e.multiplier,
        createdAt: e.created_at,
        groups,
        attendanceCount: (e.event_attendance as { count: number }[])?.[0]?.count ?? 0,
      };
    });

    // Coordinator filter: only events linked to at least one of their groups
    if (auth.groupIds) {
      const authorized = new Set(auth.groupIds);
      result = result.filter((e) => e.groups.some((g) => authorized.has(g.id)));
    }

    return NextResponse.json({ events: result });
  } catch (err) {
    console.error('Events fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description, event_date, real_hours, multiplier, group_ids } =
      await request.json();

    if (!name || !event_date || real_hours == null) {
      return NextResponse.json(
        { error: 'name, event_date, and real_hours are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Insert the event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        name,
        description: description ?? null,
        event_date,
        real_hours,
        multiplier: multiplier ?? 1.0,
      })
      .select('id')
      .single();

    if (eventError) {
      throw new Error(`Failed to create event: ${eventError.message}`);
    }

    // Insert event_groups rows
    if (group_ids && group_ids.length > 0) {
      const eventGroupRows = group_ids.map((gid: string) => ({
        event_id: event.id,
        group_id: gid,
      }));

      const { error: groupsError } = await supabase
        .from('event_groups')
        .insert(eventGroupRows);

      if (groupsError) {
        throw new Error(`Failed to assign groups: ${groupsError.message}`);
      }
    }

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (err) {
    console.error('Event create error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create event' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { eventId, name, description, event_date, real_hours, multiplier, group_ids } =
      await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Build update object with only provided fields
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (event_date !== undefined) update.event_date = event_date;
    if (real_hours !== undefined) update.real_hours = real_hours;
    if (multiplier !== undefined) update.multiplier = multiplier;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('events')
        .update(update)
        .eq('id', eventId);

      if (error) {
        throw new Error(`Failed to update event: ${error.message}`);
      }
    }

    // If group_ids provided, replace event_groups
    if (group_ids !== undefined) {
      // Delete existing
      const { error: deleteError } = await supabase
        .from('event_groups')
        .delete()
        .eq('event_id', eventId);

      if (deleteError) {
        throw new Error(`Failed to clear event groups: ${deleteError.message}`);
      }

      // Insert new
      if (group_ids.length > 0) {
        const rows = group_ids.map((gid: string) => ({
          event_id: eventId,
          group_id: gid,
        }));

        const { error: insertError } = await supabase
          .from('event_groups')
          .insert(rows);

        if (insertError) {
          throw new Error(`Failed to assign groups: ${insertError.message}`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Event update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update event' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Cascade deletes event_groups and event_attendance via FK
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      throw new Error(`Failed to delete event: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Event delete error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete event' },
      { status: 500 }
    );
  }
}
