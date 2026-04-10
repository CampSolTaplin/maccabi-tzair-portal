-- ============================================
-- Migration 010: Planning day groups + memberships
-- ============================================
--
-- Adds two new groups so the "planning day" meeting each week can be
-- tracked by the staff attendance flow just like any other session:
--
--   - SOM Planning    (Mondays)   — attended by SOM members only.
--   - Staff Planning  (Tuesdays)  — attended by every other madrich /
--                                    mazkirut across the camp.
--
-- After this runs, an admin still has to open /admin/sessions and
-- click "Generate Season" to materialize the actual Monday/Tuesday
-- session rows from the new schedules. Once that happens, the
-- existing /admin/madrich-attendance flow picks them up for free.

-- ─── 1. Create the two planning groups (idempotent) ───
INSERT INTO groups (name, slug, area, sort_order, description)
VALUES ('SOM Planning', 'som-planning', 'leadership', 100,
        'Weekly Monday planning meeting for SOM members')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO groups (name, slug, area, sort_order, description)
VALUES ('Staff Planning', 'staff-planning', 'leadership', 101,
        'Weekly Tuesday planning meeting for all other madrichim and mazkirut')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Create recurring schedules for each planning group ───
--
-- day_of_week is 0=Sunday, 1=Monday, 2=Tuesday, ... (same as Postgres EXTRACT(DOW))
INSERT INTO schedules (group_id, name, day_of_week, effective_from, is_active)
SELECT g.id, 'Monday Planning', 1, '2025-09-13'::date, TRUE
FROM groups g
WHERE g.slug = 'som-planning'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s WHERE s.group_id = g.id AND s.day_of_week = 1
  );

INSERT INTO schedules (group_id, name, day_of_week, effective_from, is_active)
SELECT g.id, 'Tuesday Planning', 2, '2025-09-13'::date, TRUE
FROM groups g
WHERE g.slug = 'staff-planning'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s WHERE s.group_id = g.id AND s.day_of_week = 2
  );

-- ─── 3. Auto-assign SOM members to "SOM Planning" ───
--
-- Every active madrich / mazkirut in the existing SOM group also becomes
-- a member of SOM Planning with the same role.
INSERT INTO group_memberships (profile_id, group_id, role, is_active)
SELECT DISTINCT gm.profile_id, plan.id, gm.role, TRUE
FROM group_memberships gm
JOIN groups som ON som.id = gm.group_id AND som.slug = 'som'
CROSS JOIN (SELECT id FROM groups WHERE slug = 'som-planning') plan
WHERE gm.role IN ('madrich', 'mazkirut')
  AND gm.is_active = TRUE
ON CONFLICT (profile_id, group_id, role) DO NOTHING;

-- ─── 4. Auto-assign every OTHER madrich / mazkirut to "Staff Planning" ───
--
-- Anyone who is a madrich or mazkirut in ANY group that isn't SOM /
-- SOM Planning / Staff Planning gets added to Staff Planning. People who
-- are ONLY in SOM are intentionally excluded.
INSERT INTO group_memberships (profile_id, group_id, role, is_active)
SELECT DISTINCT gm.profile_id, plan.id, gm.role, TRUE
FROM group_memberships gm
JOIN groups g ON g.id = gm.group_id
CROSS JOIN (SELECT id FROM groups WHERE slug = 'staff-planning') plan
WHERE gm.role IN ('madrich', 'mazkirut')
  AND gm.is_active = TRUE
  AND g.slug NOT IN ('som', 'som-planning', 'staff-planning')
  AND NOT EXISTS (
    -- If this profile is ALSO a SOM member, they go to SOM Planning instead,
    -- so exclude them from Staff Planning.
    SELECT 1
    FROM group_memberships gm2
    JOIN groups g2 ON g2.id = gm2.group_id AND g2.slug = 'som'
    WHERE gm2.profile_id = gm.profile_id
      AND gm2.is_active = TRUE
      AND gm2.role IN ('madrich', 'mazkirut')
  )
ON CONFLICT (profile_id, group_id, role) DO NOTHING;
