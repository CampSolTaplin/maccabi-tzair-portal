-- ============================================
-- Migration 002: Schedules and Sessions
-- ============================================

-- Recurring schedule definitions
CREATE TABLE schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  day_of_week      INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time       TIME,
  duration_minutes INT DEFAULT 120,
  effective_from   DATE NOT NULL,
  effective_until  DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual sessions (auto-generated from schedules, or manually created)
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  schedule_id   UUID REFERENCES schedules(id) ON DELETE SET NULL,
  session_date  DATE NOT NULL,
  session_type  TEXT NOT NULL DEFAULT 'regular'
                CHECK (session_type IN ('regular','event','makeup','special')),
  title         TEXT,
  is_cancelled  BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  hours_present NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  hours_late    NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, session_date)
);

-- Indexes
CREATE INDEX idx_schedules_group ON schedules(group_id);
CREATE INDEX idx_sessions_group ON sessions(group_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);
CREATE INDEX idx_sessions_group_date ON sessions(group_id, session_date);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Schedules: everyone can read
CREATE POLICY "Anyone reads schedules"
  ON schedules FOR SELECT
  USING (TRUE);

-- Schedules: admins manage
CREATE POLICY "Admins manage schedules"
  ON schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Sessions: everyone can read
CREATE POLICY "Anyone reads sessions"
  ON sessions FOR SELECT
  USING (TRUE);

-- Sessions: admins manage all
CREATE POLICY "Admins manage sessions"
  ON sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Sessions: madrichim can lock their group sessions
CREATE POLICY "Madrichim update group sessions"
  ON sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.profile_id = auth.uid()
        AND gm.role = 'madrich'
        AND gm.group_id = sessions.group_id
    )
  );
