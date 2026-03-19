-- ============================================
-- Migration 006: Notifications
-- ============================================

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  data          JSONB,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  profile_id           UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_absences       BOOLEAN NOT NULL DEFAULT TRUE,
  email_weekly_summary BOOLEAN NOT NULL DEFAULT FALSE,
  email_milestones     BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Salesforce sync log
CREATE TABLE salesforce_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type       TEXT NOT NULL,
  status          TEXT NOT NULL,
  records_synced  INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  triggered_by    UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_read ON notifications(recipient_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesforce_sync_log ENABLE ROW LEVEL SECURITY;

-- Notifications: own only
CREATE POLICY "Own notifications" ON notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "Mark own as read" ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());
CREATE POLICY "Admins manage notifications" ON notifications FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Notification preferences: own only
CREATE POLICY "Own preferences" ON notification_preferences FOR ALL USING (profile_id = auth.uid());
CREATE POLICY "Admins view preferences" ON notification_preferences FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Salesforce log: admins only
CREATE POLICY "Admins view sync log" ON salesforce_sync_log FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================
-- Enable Realtime for notifications
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
