import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface HoursBreakdown {
  regularSaturdays: { count: number; hoursEach: number; total: number };
  regularWeekdays: { count: number; hoursEach: number; total: number; dayName: string };
  events: { name: string; date: string; hours: number }[];
  eventTotal: number;
  grandTotal: number;
}

// Hour rates by group type
function getHourRates(groupSlug: string) {
  if (groupSlug.startsWith('madrichim-') || groupSlug === 'mazkirut') {
    return { saturday: 4, weekday: 2 }; // Madrichim: 4h Sat, 2h Tue
  }
  // SOM, Pre-SOM, and everything else: 2h per session
  return { saturday: 2, weekday: 2 };
}

function getWeekdayName(groupSlug: string) {
  if (groupSlug === 'som') return 'Wednesday';
  if (groupSlug === 'pre-som') return 'Monday';
  if (groupSlug.startsWith('madrichim-') || groupSlug === 'mazkirut') return 'Tuesday';
  return 'Weekday';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    const participantId = searchParams.get('participant_id');

    const supabase = createAdminClient();

    // If no group specified, return list of groups that have community hours (leadership area)
    if (!groupId) {
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name, slug, area')
        .in('area', ['leadership'])
        .order('sort_order');

      return NextResponse.json({ groups: groups ?? [] });
    }

    // Get group info
    const { data: group } = await supabase
      .from('groups')
      .select('id, name, slug, area')
      .eq('id', groupId)
      .single();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const rates = getHourRates(group.slug);
    const weekdayName = getWeekdayName(group.slug);

    // Get participants
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('profile_id, is_active, profiles(id, first_name, last_name)')
      .eq('group_id', groupId)
      .eq('role', 'participant');

    // Get all sessions for this group
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, session_date, is_cancelled')
      .eq('group_id', groupId)
      .order('session_date');

    const nonCancelledSessions = (sessions ?? []).filter(s => !s.is_cancelled);
    const sessionIds = nonCancelledSessions.map(s => s.id);

    // Get all attendance records
    let allRecords: { session_id: string; participant_id: string; status: string }[] = [];
    for (let i = 0; i < sessionIds.length; i += 20) {
      const chunk = sessionIds.slice(i, i + 20);
      const { data } = await supabase
        .from('attendance_records')
        .select('session_id, participant_id, status')
        .in('session_id', chunk)
        .limit(10000);
      allRecords.push(...(data ?? []));
    }

    // Get events for this group
    const { data: eventGroupLinks } = await supabase
      .from('event_groups')
      .select('event_id')
      .eq('group_id', groupId);

    const eventIds = (eventGroupLinks ?? []).map(eg => eg.event_id);
    let eventsList: { id: string; name: string; event_date: string; real_hours: number }[] = [];
    let eventAttendance: { event_id: string; participant_id: string }[] = [];

    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from('events')
        .select('id, name, event_date, real_hours')
        .in('id', eventIds)
        .order('event_date');
      eventsList = events ?? [];

      const { data: ea } = await supabase
        .from('event_attendance')
        .select('event_id, participant_id')
        .in('event_id', eventIds);
      eventAttendance = ea ?? [];
    }

    // Build session lookup: sessionId → { date, dayOfWeek }
    const sessionInfo = new Map<string, { date: string; dayOfWeek: number }>();
    for (const s of nonCancelledSessions) {
      const d = new Date(s.session_date + 'T12:00:00');
      sessionInfo.set(s.id, { date: s.session_date, dayOfWeek: d.getDay() });
    }

    // If specific participant requested, return detailed breakdown
    if (participantId) {
      const participantRecords = allRecords.filter(r => r.participant_id === participantId && r.status === 'present');
      const participantEventAttendance = eventAttendance.filter(ea => ea.participant_id === participantId);

      let satCount = 0;
      let weekdayCount = 0;

      for (const r of participantRecords) {
        const info = sessionInfo.get(r.session_id);
        if (!info) continue;
        if (info.dayOfWeek === 6) satCount++;
        else weekdayCount++;
      }

      const eventsAttended = eventsList
        .filter(ev => participantEventAttendance.some(ea => ea.event_id === ev.id))
        .map(ev => ({ name: ev.name, date: ev.event_date, hours: ev.real_hours }));

      const eventTotal = eventsAttended.reduce((s, e) => s + e.hours, 0);
      const satTotal = satCount * rates.saturday;
      const weekdayTotal = weekdayCount * rates.weekday;

      const breakdown: HoursBreakdown = {
        regularSaturdays: { count: satCount, hoursEach: rates.saturday, total: satTotal },
        regularWeekdays: { count: weekdayCount, hoursEach: rates.weekday, total: weekdayTotal, dayName: weekdayName },
        events: eventsAttended,
        eventTotal,
        grandTotal: satTotal + weekdayTotal + eventTotal,
      };

      // Get participant profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', participantId)
        .single();

      return NextResponse.json({
        participant: { id: participantId, ...profile },
        group: { name: group.name, slug: group.slug },
        breakdown,
      });
    }

    // Return summary for all participants
    const participants = (memberships ?? []).map(m => {
      const p = m.profiles as unknown as { id: string; first_name: string; last_name: string } | null;
      if (!p) return null;

      const pRecords = allRecords.filter(r => r.participant_id === p.id && r.status === 'present');
      const pEvents = eventAttendance.filter(ea => ea.participant_id === p.id);

      let satCount = 0;
      let weekdayCount = 0;
      for (const r of pRecords) {
        const info = sessionInfo.get(r.session_id);
        if (!info) continue;
        if (info.dayOfWeek === 6) satCount++;
        else weekdayCount++;
      }

      const eventHours = eventsList
        .filter(ev => pEvents.some(ea => ea.event_id === ev.id))
        .reduce((s, ev) => s + ev.real_hours, 0);

      const totalHours = (satCount * rates.saturday) + (weekdayCount * rates.weekday) + eventHours;

      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        isDropout: !m.is_active,
        saturdaySessions: satCount,
        weekdaySessions: weekdayCount,
        eventHours,
        totalHours,
      };
    }).filter(Boolean);

    // Sort by last name
    participants.sort((a, b) => (a!.lastName ?? '').localeCompare(b!.lastName ?? ''));

    return NextResponse.json({
      group: { name: group.name, slug: group.slug },
      rates,
      weekdayName,
      participants,
    });
  } catch (err) {
    console.error('Hours error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
