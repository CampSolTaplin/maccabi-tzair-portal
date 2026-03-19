-- ============================================
-- Migration 005: Goals and Self-Evaluation
-- ============================================

CREATE TABLE goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT CHECK (category IN ('leadership','community','personal','academic')),
  target_value    INT,
  target_unit     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','abandoned')),
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE goal_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  progress_value  INT,
  note            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Periodic self-evaluation
CREATE TABLE evaluation_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  questions   JSONB NOT NULL,
  group_id    UUID REFERENCES groups(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evaluation_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES evaluation_templates(id),
  participant_id  UUID NOT NULL REFERENCES profiles(id),
  answers         JSONB NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, participant_id)
);

-- Indexes
CREATE INDEX idx_goals_participant ON goals(participant_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goal_updates_goal ON goal_updates(goal_id);
CREATE INDEX idx_eval_responses_participant ON evaluation_responses(participant_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_responses ENABLE ROW LEVEL SECURITY;

-- Goals: own only
CREATE POLICY "Own goals" ON goals FOR ALL USING (participant_id = auth.uid());
CREATE POLICY "Admins view all goals" ON goals FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Parents view children goals" ON goals FOR SELECT
  USING (EXISTS (SELECT 1 FROM parent_child pc WHERE pc.parent_id = auth.uid() AND pc.child_id = goals.participant_id));

-- Goal updates: via goal ownership
CREATE POLICY "Own goal updates" ON goal_updates FOR ALL
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_updates.goal_id AND g.participant_id = auth.uid()));
CREATE POLICY "Admins view all goal updates" ON goal_updates FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Evaluation templates: everyone reads active, admins manage
CREATE POLICY "Anyone reads active templates" ON evaluation_templates FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins manage templates" ON evaluation_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Evaluation responses: own only
CREATE POLICY "Own responses" ON evaluation_responses FOR ALL USING (participant_id = auth.uid());
CREATE POLICY "Admins view all responses" ON evaluation_responses FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
