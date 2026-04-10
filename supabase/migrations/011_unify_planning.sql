-- ============================================
-- Migration 011: unify planning into primary groups
-- ============================================
--
-- Drops the separate "SOM Planning" and "Staff Planning" groups and
-- moves the concept of a planning day onto each primary group
-- directly, using a new session_type column on schedules.
--
-- After this migration the mental model is simpler:
--   - Every group (SOM, Katan 3rd, Noar 5th, Pre-SOM, etc.) has its
--     own schedules.
--   - A schedule is either 'regular' (chanichim + madrichim attend)
--     or 'planning' (madrichim only, no chanichim).
--   - The same session_type flag lives on sessions so the chanichim
--     attendance views can skip planning sessions while the staff
--     attendance views show everything.
--
-- WARNING: this DELETEs the two planning groups. CASCADE drops their
-- sessions, group_memberships and attendance_records. Any staff
-- attendance previously marked on a SOM Planning or Staff Planning
-- row is lost. That data is small / transitional, so we accept the
-- reset. After running this migration the admin needs to click
-- "Generate Season" on /admin/sessions so the new planning sessions
-- get materialized into the sessions table.

-- ─── 1. Add session_type to the schedules table ───
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'regular';

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_session_type_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_session_type_check
  CHECK (session_type IN ('regular', 'planning'));

-- ─── 2. Drop the separate planning groups ───
-- CASCADE drops their sessions, group_memberships and attendance_records.
DELETE FROM groups WHERE slug IN ('som-planning', 'staff-planning');

-- ─── 3. Add planning schedules to the relevant primary groups ───
-- SOM members plan on Monday.
INSERT INTO schedules (group_id, name, day_of_week, effective_from, is_active, session_type)
SELECT id, 'Monday Planning', 1, '2025-09-13'::date, TRUE, 'planning'
FROM groups g
WHERE slug = 'som'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.group_id = g.id AND s.day_of_week = 1 AND s.session_type = 'planning'
  );

-- Pre-SOM and every Katan / Noar sub-group plans on Tuesday.
INSERT INTO schedules (group_id, name, day_of_week, effective_from, is_active, session_type)
SELECT id, 'Tuesday Planning', 2, '2025-09-13'::date, TRUE, 'planning'
FROM groups g
WHERE (area IN ('katan', 'noar') OR slug = 'pre-som')
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.group_id = g.id AND s.day_of_week = 2 AND s.session_type = 'planning'
  );
