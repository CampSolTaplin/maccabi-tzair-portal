-- ============================================
-- Migration 003: Attendance Records
-- ============================================

-- One row per participant per session
CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('present','late','absent','excused')),
  marked_by       UUID REFERENCES profiles(id),
  marked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(session_id, participant_id)
);

-- Indexes
CREATE INDEX idx_attendance_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_participant ON attendance_records(participant_id);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Participants view own attendance
CREATE POLICY "Participants view own attendance"
  ON attendance_records FOR SELECT
  USING (participant_id = auth.uid());

-- Admins manage all attendance
CREATE POLICY "Admins manage all attendance"
  ON attendance_records FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Madrichim manage attendance for their group sessions
CREATE POLICY "Madrichim manage group attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'madrich'
        AND s.is_locked = FALSE
    )
  );

CREATE POLICY "Madrichim update group attendance"
  ON attendance_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'madrich'
        AND s.is_locked = FALSE
    )
  );

-- Madrichim view attendance for their group sessions
CREATE POLICY "Madrichim view group attendance"
  ON attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      WHERE s.id = attendance_records.session_id
        AND gm.profile_id = auth.uid()
        AND gm.role = 'madrich'
    )
  );

-- Parents view children's attendance
CREATE POLICY "Parents view children attendance"
  ON attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_child pc
      WHERE pc.parent_id = auth.uid()
        AND pc.child_id = attendance_records.participant_id
    )
  );

-- ============================================
-- Enable Realtime for attendance_records
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
