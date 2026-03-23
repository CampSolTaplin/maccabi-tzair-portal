import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createAdminClient();

    // 1. Get the group IDs for this event
    const { data: eventGroups, error: egError } = await supabase
      .from('event_groups')
      .select('group_id')
      .eq('event_id', eventId);

    if (egError) {
      throw new Error(`Failed to fetch event groups: ${egError.message}`);
    }

    const groupIds = (eventGroups ?? []).map((eg) => eg.group_id);

    if (groupIds.length === 0) {
      return NextResponse.json({ participants: [] });
    }

    // 2. Get all participants from those groups
    const { data: memberships, error: memError } = await supabase
      .from('group_memberships')
      .select(`
        profile_id,
        group_id,
        profiles:profile_id (
          id, first_name, last_name
        )
      `)
      .in('group_id', groupIds)
      .eq('is_active', true)
      .eq('role', 'participant');

    if (memError) {
      throw new Error(`Failed to fetch participants: ${memError.message}`);
    }

    // 3. Get existing attendance records for this event
    const { data: attendanceRecords, error: attError } = await supabase
      .from('event_attendance')
      .select('participant_id, attended')
      .eq('event_id', eventId);

    if (attError) {
      throw new Error(`Failed to fetch attendance: ${attError.message}`);
    }

    const attendanceMap = new Map<string, boolean>();
    for (const rec of attendanceRecords ?? []) {
      attendanceMap.set(rec.participant_id, rec.attended);
    }

    // 4. Deduplicate participants (might be in multiple groups)
    const seen = new Set<string>();
    const participants: Array<{
      id: string;
      firstName: string;
      lastName: string;
      attended: boolean | null;
    }> = [];

    for (const m of memberships ?? []) {
      const p = m.profiles as unknown as {
        id: string;
        first_name: string;
        last_name: string;
      } | null;

      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);

      participants.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        attended: attendanceMap.has(p.id) ? attendanceMap.get(p.id)! : null,
      });
    }

    // Sort alphabetically
    participants.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    );

    return NextResponse.json({ participants });
  } catch (err) {
    console.error('Event attendance fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch attendance' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { participantId, attended } = await request.json();

    if (!participantId || typeof attended !== 'boolean') {
      return NextResponse.json(
        { error: 'participantId and attended (boolean) are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    if (attended) {
      // Upsert attendance record
      const { error } = await supabase
        .from('event_attendance')
        .upsert(
          {
            event_id: eventId,
            participant_id: participantId,
            attended: true,
          },
          { onConflict: 'event_id,participant_id' }
        );

      if (error) {
        throw new Error(`Failed to mark attendance: ${error.message}`);
      }
    } else {
      // Remove attendance record
      const { error } = await supabase
        .from('event_attendance')
        .delete()
        .eq('event_id', eventId)
        .eq('participant_id', participantId);

      if (error) {
        throw new Error(`Failed to remove attendance: ${error.message}`);
      }
    }

    return NextResponse.json({ success: true, attended });
  } catch (err) {
    console.error('Event attendance toggle error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Toggle failed' },
      { status: 500 }
    );
  }
}
