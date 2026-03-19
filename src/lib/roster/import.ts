import { createAdminClient } from '@/lib/supabase/admin';
import type { RosterRow } from './parse-csv';

/* ─── Group Slug Mapping ─── */

const COURSE_SEGMENT_TO_SLUG: Record<string, string> = {
  'Katan - Kinder': 'katan-kinder',
  'Katan - 1st Grade': 'katan-1st',
  'Katan - 2nd Grade': 'katan-2nd',
  'Katan - 3rd Grade': 'katan-3rd',
  'Katan - 4th Grade': 'katan-4th',
  'Katan - 5th Grade': 'katan-5th',
  'Noar 6th Grade': 'noar-6th',
  'Noar 7th Grade': 'noar-7th',
  'Noar 8th Grade': 'noar-8th',
  'Pre-SOM 9th Grade': 'pre-som',
  'SOM 10th Grade (MEMBERS ONLY)': 'som',
};

/* ─── Result Types ─── */

export interface ImportResult {
  totalRows: number;
  newParticipants: number;
  updatedParticipants: number;
  unchangedParticipants: number;
  newMemberships: number;
  errors: { row: number; name: string; error: string }[];
  changes: {
    name: string;
    contactId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

export interface PreviewResult {
  totalRows: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  newMemberships: number;
  changes: {
    name: string;
    contactId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  newParticipants: {
    name: string;
    contactId: string;
    grade: string | null;
    groupSlug: string | null;
    school: string | null;
  }[];
  unmappedGroups: string[];
}

/* ─── Helpers ─── */

/**
 * Extract group slug from Full Course Option Name.
 * The 4th pipe-delimited segment maps to a group.
 */
export function parseGroupSlug(courseOptionName: string): string | null {
  const segments = courseOptionName.split('|').map((s) => s.trim());
  const groupSegment = segments[3]; // 4th segment (0-indexed)
  if (!groupSegment) return null;
  return COURSE_SEGMENT_TO_SLUG[groupSegment] ?? null;
}

/**
 * Split full name into first and last name.
 * Split on FIRST space: "Rafaella Di Capua" -> ["Rafaella", "Di Capua"]
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1),
  };
}

/**
 * Deduplicate rows by contactId, collecting all course option names per contact.
 */
function deduplicateByContact(
  rows: RosterRow[]
): Map<string, { row: RosterRow; courseOptions: string[]; rowIndices: number[] }> {
  const map = new Map<
    string,
    { row: RosterRow; courseOptions: string[]; rowIndices: number[] }
  >();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const existing = map.get(row.contactId);
    if (existing) {
      existing.courseOptions.push(row.courseOptionName);
      existing.rowIndices.push(i + 1); // 1-indexed for display
    } else {
      map.set(row.contactId, {
        row,
        courseOptions: [row.courseOptionName],
        rowIndices: [i + 1],
      });
    }
  }

  return map;
}

/* ─── Preview (dry-run) ─── */

export async function previewRoster(rows: RosterRow[]): Promise<PreviewResult> {
  const adminClient = createAdminClient();

  // Load groups
  const { data: groups, error: groupsError } = await adminClient
    .from('groups')
    .select('id, slug');
  if (groupsError) throw new Error(`Failed to load groups: ${groupsError.message}`);

  const slugToId = new Map<string, string>();
  for (const g of groups ?? []) {
    slugToId.set(g.slug, g.id);
  }

  // Load existing profiles by salesforce_contact_id
  const { data: existingProfiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, salesforce_contact_id, first_name, last_name, grade, school, allergies')
    .not('salesforce_contact_id', 'is', null);
  if (profilesError) throw new Error(`Failed to load profiles: ${profilesError.message}`);

  const profileMap = new Map<string, (typeof existingProfiles)[number]>();
  for (const p of existingProfiles ?? []) {
    if (p.salesforce_contact_id) {
      profileMap.set(p.salesforce_contact_id, p);
    }
  }

  // Load existing memberships
  const { data: existingMemberships, error: memberError } = await adminClient
    .from('group_memberships')
    .select('profile_id, group_id, is_active');
  if (memberError) throw new Error(`Failed to load memberships: ${memberError.message}`);

  const membershipSet = new Set<string>();
  for (const m of existingMemberships ?? []) {
    if (m.is_active) {
      membershipSet.add(`${m.profile_id}::${m.group_id}`);
    }
  }

  const contactMap = deduplicateByContact(rows);

  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  let newMemberships = 0;
  const changes: PreviewResult['changes'] = [];
  const newParticipants: PreviewResult['newParticipants'] = [];
  const unmappedGroupsSet = new Set<string>();

  for (const [contactId, { row, courseOptions }] of contactMap) {
    const { firstName, lastName } = splitName(row.fullName);
    const existing = profileMap.get(contactId);

    // Parse all group slugs for this contact
    const groupSlugs: string[] = [];
    for (const co of courseOptions) {
      const slug = parseGroupSlug(co);
      if (slug) {
        groupSlugs.push(slug);
      } else {
        const segments = co.split('|').map((s) => s.trim());
        if (segments[3]) unmappedGroupsSet.add(segments[3]);
      }
    }

    if (!existing) {
      // New participant
      newCount++;
      newParticipants.push({
        name: row.fullName,
        contactId,
        grade: row.grade,
        groupSlug: groupSlugs[0] ?? null,
        school: row.school,
      });
      // All groups would be new memberships
      newMemberships += groupSlugs.filter((s) => slugToId.has(s)).length;
    } else {
      // Check for changes
      const fieldChanges: { field: string; oldValue: string; newValue: string }[] = [];

      if (existing.first_name !== firstName || existing.last_name !== lastName) {
        fieldChanges.push({
          field: 'name',
          oldValue: `${existing.first_name} ${existing.last_name}`,
          newValue: `${firstName} ${lastName}`,
        });
      }
      if (row.grade && existing.grade !== row.grade) {
        fieldChanges.push({
          field: 'grade',
          oldValue: existing.grade ?? '(empty)',
          newValue: row.grade,
        });
      }
      if (row.school && existing.school !== row.school) {
        fieldChanges.push({
          field: 'school',
          oldValue: existing.school ?? '(empty)',
          newValue: row.school,
        });
      }
      if (row.allergies && existing.allergies !== row.allergies) {
        fieldChanges.push({
          field: 'allergies',
          oldValue: existing.allergies ?? '(empty)',
          newValue: row.allergies,
        });
      }

      if (fieldChanges.length > 0) {
        updateCount++;
        for (const c of fieldChanges) {
          changes.push({ name: row.fullName, contactId, ...c });
        }
      } else {
        unchangedCount++;
      }

      // Check memberships
      for (const slug of groupSlugs) {
        const groupId = slugToId.get(slug);
        if (groupId && !membershipSet.has(`${existing.id}::${groupId}`)) {
          newMemberships++;
        }
      }
    }
  }

  return {
    totalRows: rows.length,
    newCount,
    updateCount,
    unchangedCount,
    newMemberships,
    changes,
    newParticipants,
    unmappedGroups: Array.from(unmappedGroupsSet),
  };
}

/* ─── Import (apply changes) ─── */

export async function importRoster(
  rows: RosterRow[],
  triggeredBy: string
): Promise<ImportResult> {
  const adminClient = createAdminClient();

  // Load groups
  const { data: groups, error: groupsError } = await adminClient
    .from('groups')
    .select('id, slug');
  if (groupsError) throw new Error(`Failed to load groups: ${groupsError.message}`);

  const slugToId = new Map<string, string>();
  for (const g of groups ?? []) {
    slugToId.set(g.slug, g.id);
  }

  // Load existing profiles by salesforce_contact_id
  const { data: existingProfiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, salesforce_contact_id, first_name, last_name, grade, school, allergies')
    .not('salesforce_contact_id', 'is', null);
  if (profilesError) throw new Error(`Failed to load profiles: ${profilesError.message}`);

  const profileMap = new Map<
    string,
    { id: string; first_name: string; last_name: string; grade: string | null; school: string | null; allergies: string | null }
  >();
  for (const p of existingProfiles ?? []) {
    if (p.salesforce_contact_id) {
      profileMap.set(p.salesforce_contact_id, {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        grade: p.grade ?? null,
        school: p.school ?? null,
        allergies: p.allergies ?? null,
      });
    }
  }

  // Load existing active memberships
  const { data: existingMemberships, error: memberError } = await adminClient
    .from('group_memberships')
    .select('id, profile_id, group_id, is_active');
  if (memberError) throw new Error(`Failed to load memberships: ${memberError.message}`);

  const membershipSet = new Set<string>();
  for (const m of existingMemberships ?? []) {
    if (m.is_active) {
      membershipSet.add(`${m.profile_id}::${m.group_id}`);
    }
  }

  const contactMap = deduplicateByContact(rows);
  const result: ImportResult = {
    totalRows: rows.length,
    newParticipants: 0,
    updatedParticipants: 0,
    unchangedParticipants: 0,
    newMemberships: 0,
    errors: [],
    changes: [],
  };

  for (const [contactId, { row, courseOptions, rowIndices }] of contactMap) {
    try {
      const { firstName, lastName } = splitName(row.fullName);
      const existing = profileMap.get(contactId);

      // Parse group slugs
      const groupSlugs: string[] = [];
      for (const co of courseOptions) {
        const slug = parseGroupSlug(co);
        if (slug) groupSlugs.push(slug);
      }

      // Extract first email from Contact: All Emails
      const firstEmail =
        row.emails
          ?.split(';')
          .map((e) => e.trim())
          .find((e) => e.includes('@')) ?? null;

      let profileId: string;

      if (!existing) {
        // CREATE new profile
        const newId = crypto.randomUUID();
        const { error: insertError } = await adminClient.from('profiles').insert({
          id: newId,
          first_name: firstName,
          last_name: lastName,
          role: 'participant',
          salesforce_contact_id: contactId,
          salesforce_account_id: row.accountId || null,
          grade: row.grade,
          school: row.school,
          allergies: row.allergies,
          phone: firstEmail, // Store first email as phone for contact info
          is_active: true,
          needs_email: !firstEmail,
        });

        if (insertError) {
          result.errors.push({
            row: rowIndices[0],
            name: row.fullName,
            error: `Failed to create profile: ${insertError.message}`,
          });
          continue;
        }

        profileId = newId;
        result.newParticipants++;
      } else {
        // CHECK for updates
        profileId = existing.id;
        const updates: Record<string, unknown> = {};

        if (existing.first_name !== firstName || existing.last_name !== lastName) {
          updates.first_name = firstName;
          updates.last_name = lastName;
          updates.display_name = `${firstName} ${lastName}`;
          result.changes.push({
            name: row.fullName,
            contactId,
            field: 'name',
            oldValue: `${existing.first_name} ${existing.last_name}`,
            newValue: `${firstName} ${lastName}`,
          });
        }

        if (row.grade && existing.grade !== row.grade) {
          result.changes.push({
            name: row.fullName,
            contactId,
            field: 'grade',
            oldValue: existing.grade ?? '(empty)',
            newValue: row.grade,
          });
          updates.grade = row.grade;
        }

        if (row.school && existing.school !== row.school) {
          result.changes.push({
            name: row.fullName,
            contactId,
            field: 'school',
            oldValue: existing.school ?? '(empty)',
            newValue: row.school,
          });
          updates.school = row.school;
        }

        if (row.allergies && existing.allergies !== row.allergies) {
          result.changes.push({
            name: row.fullName,
            contactId,
            field: 'allergies',
            oldValue: existing.allergies ?? '(empty)',
            newValue: row.allergies,
          });
          updates.allergies = row.allergies;
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error: updateError } = await adminClient
            .from('profiles')
            .update(updates)
            .eq('id', profileId);

          if (updateError) {
            result.errors.push({
              row: rowIndices[0],
              name: row.fullName,
              error: `Failed to update profile: ${updateError.message}`,
            });
            continue;
          }
          result.updatedParticipants++;
        } else {
          result.unchangedParticipants++;
        }
      }

      // Handle group memberships
      for (const slug of groupSlugs) {
        const groupId = slugToId.get(slug);
        if (!groupId) continue;

        const key = `${profileId}::${groupId}`;
        if (membershipSet.has(key)) continue;

        const { error: membershipError } = await adminClient
          .from('group_memberships')
          .insert({
            id: crypto.randomUUID(),
            profile_id: profileId,
            group_id: groupId,
            role: 'participant',
            is_active: true,
          });

        if (membershipError) {
          // Might be duplicate - ignore unique constraint errors
          if (!membershipError.message.includes('duplicate') && !membershipError.message.includes('unique')) {
            result.errors.push({
              row: rowIndices[0],
              name: row.fullName,
              error: `Failed to create membership for ${slug}: ${membershipError.message}`,
            });
          }
        } else {
          result.newMemberships++;
          membershipSet.add(key);
        }
      }
    } catch (err) {
      result.errors.push({
        row: rowIndices[0],
        name: row.fullName,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}
