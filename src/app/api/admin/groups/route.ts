import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    // Fetch all active groups ordered by sort_order
    const { data: groups, error: groupsError } = await adminClient
      .from('groups')
      .select('id, name, slug, description, area, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (groupsError) {
      throw new Error(`Failed to load groups: ${groupsError.message}`);
    }

    // Fetch all active memberships with profile details
    const { data: memberships, error: memberError } = await adminClient
      .from('group_memberships')
      .select(`
        group_id,
        profiles:profile_id (
          id,
          first_name,
          last_name,
          grade,
          school,
          allergies,
          salesforce_contact_id,
          parent_name,
          parent_email,
          parent_phone,
          emergency_contact_name,
          emergency_contact_phone,
          family_name,
          gender,
          father_name,
          father_email,
          father_phone,
          mother_name,
          mother_email,
          mother_phone
        )
      `)
      .eq('is_active', true)
      .eq('role', 'participant');

    if (memberError) {
      throw new Error(`Failed to load memberships: ${memberError.message}`);
    }

    // Build a map of group_id -> members
    const memberMap = new Map<string, Array<{
      id: string;
      firstName: string;
      lastName: string;
      grade: string | null;
      school: string | null;
      allergies: string | null;
      salesforceContactId: string | null;
      parentName: string | null;
      parentEmail: string | null;
      parentPhone: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      familyName: string | null;
      gender: string | null;
      fatherName: string | null;
      fatherEmail: string | null;
      fatherPhone: string | null;
      motherName: string | null;
      motherEmail: string | null;
      motherPhone: string | null;
    }>>();

    for (const m of memberships ?? []) {
      const p = m.profiles as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        grade: string | null;
        school: string | null;
        allergies: string | null;
        salesforce_contact_id: string | null;
        parent_name: string | null;
        parent_email: string | null;
        parent_phone: string | null;
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
        family_name: string | null;
        gender: string | null;
        father_name: string | null;
        father_email: string | null;
        father_phone: string | null;
        mother_name: string | null;
        mother_email: string | null;
        mother_phone: string | null;
      } | null;

      if (!p) continue;

      const list = memberMap.get(m.group_id) ?? [];
      list.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        grade: p.grade,
        school: p.school,
        allergies: p.allergies,
        salesforceContactId: p.salesforce_contact_id,
        parentName: p.parent_name,
        parentEmail: p.parent_email,
        parentPhone: p.parent_phone,
        emergencyContactName: p.emergency_contact_name,
        emergencyContactPhone: p.emergency_contact_phone,
        familyName: p.family_name,
        gender: p.gender,
        fatherName: p.father_name,
        fatherEmail: p.father_email,
        fatherPhone: p.father_phone,
        motherName: p.mother_name,
        motherEmail: p.mother_email,
        motherPhone: p.mother_phone,
      });
      memberMap.set(m.group_id, list);
    }

    // Sort members alphabetically within each group
    for (const [, members] of memberMap) {
      members.sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      );
    }

    const result = (groups ?? []).map((g) => {
      const members = memberMap.get(g.id) ?? [];
      return {
        id: g.id,
        name: g.name,
        slug: g.slug,
        area: g.area ?? 'other',
        description: g.description ?? '',
        memberCount: members.length,
        members,
      };
    });

    return NextResponse.json({ groups: result });
  } catch (err) {
    console.error('Groups API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load groups' },
      { status: 500 }
    );
  }
}

// Check dependencies before deleting, then delete
export async function DELETE(request: NextRequest) {
  try {
    const { groupId, confirm } = await request.json();
    if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 });

    const supabase = createAdminClient();

    // Count dependencies
    const { count: memberCount } = await supabase
      .from('group_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId);

    const { count: sessionCount } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId);

    const { count: eventLinkCount } = await supabase
      .from('event_groups')
      .select('event_id', { count: 'exact', head: true })
      .eq('group_id', groupId);

    // Count attendance records across sessions
    const { data: sessionIds } = await supabase
      .from('sessions')
      .select('id')
      .eq('group_id', groupId);

    let attendanceCount = 0;
    if (sessionIds?.length) {
      for (let i = 0; i < sessionIds.length; i += 50) {
        const chunk = sessionIds.slice(i, i + 50).map(s => s.id);
        const { count } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .in('session_id', chunk);
        attendanceCount += count ?? 0;
      }
    }

    // If not confirmed, return the dependency summary
    if (!confirm) {
      return NextResponse.json({
        dependencies: {
          members: memberCount ?? 0,
          sessions: sessionCount ?? 0,
          attendanceRecords: attendanceCount,
          eventLinks: eventLinkCount ?? 0,
        },
      });
    }

    // Confirmed — delete everything in order
    // 1. Delete attendance records
    if (sessionIds?.length) {
      for (let i = 0; i < sessionIds.length; i += 50) {
        const chunk = sessionIds.slice(i, i + 50).map(s => s.id);
        await supabase.from('attendance_records').delete().in('session_id', chunk);
      }
    }

    // 2. Delete sessions
    await supabase.from('sessions').delete().eq('group_id', groupId);

    // 3. Delete event links
    await supabase.from('event_groups').delete().eq('group_id', groupId);

    // 4. Delete memberships
    await supabase.from('group_memberships').delete().eq('group_id', groupId);

    // 5. Delete schedules
    await supabase.from('schedules').delete().eq('group_id', groupId);

    // 6. Delete the group
    await supabase.from('groups').delete().eq('id', groupId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Group delete error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
