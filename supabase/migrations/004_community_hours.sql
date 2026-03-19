-- ============================================
-- Migration 004: Community Hours, Events
-- ============================================

-- Community events
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  event_date  DATE NOT NULL,
  real_hours  NUMERIC(4,2) NOT NULL,
  multiplier  NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which groups an event applies to (empty = all)
CREATE TABLE event_groups (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, group_id)
);

-- Event attendance
CREATE TABLE event_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attended        BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(event_id, participant_id)
);

-- Community hours ledger (all sources)
CREATE TABLE community_hours (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL
                  CHECK (source_type IN ('attendance','event','volunteer','manual','goal_bonus')),
  source_id       UUID,
  hours           NUMERIC(6,2) NOT NULL,
  description     TEXT,
  earned_date     DATE NOT NULL,
  approved        BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configurable hour weights
CREATE TABLE hour_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID REFERENCES groups(id),
  config_key  TEXT NOT NULL,
  value       NUMERIC(6,2) NOT NULL,
  UNIQUE(group_id, config_key)
);

-- Indexes
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_event_attendance_event ON event_attendance(event_id);
CREATE INDEX idx_event_attendance_participant ON event_attendance(participant_id);
CREATE INDEX idx_community_hours_participant ON community_hours(participant_id);
CREATE INDEX idx_community_hours_source ON community_hours(source_type);
CREATE INDEX idx_community_hours_date ON community_hours(earned_date);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE hour_config ENABLE ROW LEVEL SECURITY;

-- Events: everyone reads
CREATE POLICY "Anyone reads events" ON events FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage events" ON events FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Event groups: everyone reads
CREATE POLICY "Anyone reads event_groups" ON event_groups FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage event_groups" ON event_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Event attendance: participants see own, admins manage all
CREATE POLICY "Participants view own event attendance"
  ON event_attendance FOR SELECT USING (participant_id = auth.uid());
CREATE POLICY "Admins manage event attendance" ON event_attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Community hours: participants see own
CREATE POLICY "Participants view own hours"
  ON community_hours FOR SELECT USING (participant_id = auth.uid());

-- Community hours: participants insert volunteer hours (unapproved)
CREATE POLICY "Participants submit volunteer hours"
  ON community_hours FOR INSERT
  WITH CHECK (
    participant_id = auth.uid()
    AND source_type = 'volunteer'
    AND approved = FALSE
  );

-- Community hours: admins manage all
CREATE POLICY "Admins manage hours" ON community_hours FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Community hours: parents see children
CREATE POLICY "Parents view children hours"
  ON community_hours FOR SELECT
  USING (EXISTS (SELECT 1 FROM parent_child pc WHERE pc.parent_id = auth.uid() AND pc.child_id = community_hours.participant_id));

-- Hour config: everyone reads, admins manage
CREATE POLICY "Anyone reads hour_config" ON hour_config FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage hour_config" ON hour_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================
-- Trigger: auto-create community_hours on attendance
-- ============================================
CREATE OR REPLACE FUNCTION sync_attendance_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_hours NUMERIC(6,2);
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = NEW.session_id;

  -- Calculate hours based on attendance status
  IF NEW.status = 'present' THEN
    v_hours := v_session.hours_present;
  ELSIF NEW.status = 'late' THEN
    v_hours := v_session.hours_late;
  ELSE
    v_hours := 0;
  END IF;

  -- Upsert into community_hours
  INSERT INTO community_hours (participant_id, source_type, source_id, hours, description, earned_date)
  VALUES (
    NEW.participant_id,
    'attendance',
    NEW.session_id,
    v_hours,
    'Session: ' || COALESCE(v_session.title, TO_CHAR(v_session.session_date, 'Mon DD, YYYY')),
    v_session.session_date
  )
  ON CONFLICT (participant_id, source_type, source_id)
    WHERE source_type = 'attendance'
  DO UPDATE SET
    hours = EXCLUDED.hours,
    description = EXCLUDED.description;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Need a partial unique index for the ON CONFLICT to work
CREATE UNIQUE INDEX idx_community_hours_attendance_unique
  ON community_hours (participant_id, source_type, source_id)
  WHERE source_type = 'attendance';

CREATE TRIGGER attendance_hours_sync
  AFTER INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION sync_attendance_hours();

-- ============================================
-- Seed default hour config
-- ============================================
INSERT INTO hour_config (group_id, config_key, value) VALUES
  (NULL, 'regular_present', 2.0),
  (NULL, 'regular_late', 1.0),
  (NULL, 'event_multiplier_default', 1.0);
