-- ============================================
-- Migration 009: Staff attendance (madrichim / mazkirut)
-- ============================================
--
-- Allows coordinators to take attendance for madrichim and mazkirut
-- against the same sessions that already exist for chanichim. The
-- attendance data reuses the attendance_records table (participant_id
-- there is actually a FK to profiles, not strictly participants).
--
-- Key changes:
--   1. sessions gains a second lock flag so staff attendance can be
--      locked independently from chanichim attendance.
--   2. 'planning' is added to the session_type enum so a future seed
--      can create weekly planning sessions (Mon for SOM, Tue for the
--      rest) without the existing constraint rejecting them.
--   3. Coordinators get RLS policies to manage attendance_records
--      and sessions for the groups they coordinate.
--   4. Madrichim lose their "lock/unlock sessions" RLS policy — from
--      now on only coordinators and admins can lock or unlock. They
--      keep the policies that let them write attendance_records for
--      their group sessions.

-- ─── 1. Extra lock column for staff attendance ───
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_locked_staff BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Allow 'planning' as a session_type value ───
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('regular','event','makeup','special','planning'));

-- ─── 3. Coordinator RLS on attendance_records ───

-- SELECT: coordinators can read attendance_records for any session
-- in a group they are an active coordinator of.
CREATE POLICY "Coordinators view group attendance"
  ON attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'coordinator'
        AND gm.is_active = TRUE
    )
  );

-- INSERT: same scope. No lock gate here because coordinators are the
-- ones who actually own the lock for staff attendance — the app layer
-- decides which lock field applies (is_locked vs is_locked_staff).
CREATE POLICY "Coordinators insert group attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'coordinator'
        AND gm.is_active = TRUE
    )
  );

CREATE POLICY "Coordinators update group attendance"
  ON attendance_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'coordinator'
        AND gm.is_active = TRUE
    )
  );

CREATE POLICY "Coordinators delete group attendance"
  ON attendance_records FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'coordinator'
        AND gm.is_active = TRUE
    )
  );

-- ─── 4. Coordinators can update sessions (for lock / unlock) ───
CREATE POLICY "Coordinators update group sessions"
  ON sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.profile_id = auth.uid()
        AND gm.role = 'coordinator'
        AND gm.is_active = TRUE
        AND gm.group_id = sessions.group_id
    )
  );

-- ─── 5. Madrichim can NO LONGER lock / unlock sessions ───
-- They keep the attendance_records policies (they still write attendance)
-- but they can't touch the session's is_locked field.
DROP POLICY IF EXISTS "Madrichim update group sessions" ON sessions;
