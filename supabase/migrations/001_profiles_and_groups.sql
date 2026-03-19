-- ============================================
-- Migration 001: Profiles, Groups, Memberships
-- ============================================

-- Profiles: extends Supabase auth.users
CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('admin','madrich','participant','parent')),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  display_name          TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  avatar_url            TEXT,
  phone                 TEXT,
  salesforce_contact_id TEXT UNIQUE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Groups (SOM, Katan, Noar, Pre-SOM, etc.)
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  area        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: users belong to groups with a role context
CREATE TABLE group_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('participant','madrich','admin')),
  joined_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  left_at     DATE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(profile_id, group_id, role)
);

-- Parent-child relationships
CREATE TABLE parent_child (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship  TEXT DEFAULT 'parent',
  UNIQUE(parent_id, child_id)
);

-- Indexes
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_salesforce_id ON profiles(salesforce_contact_id);
CREATE INDEX idx_group_memberships_profile ON group_memberships(profile_id);
CREATE INDEX idx_group_memberships_group ON group_memberships(group_id);
CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child ON parent_child(child_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup (via auth trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'participant'),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_child ENABLE ROW LEVEL SECURITY;

-- Profiles: users see themselves
CREATE POLICY "Users view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Profiles: admins see all
CREATE POLICY "Admins view all profiles"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Profiles: admins can update all
CREATE POLICY "Admins update all profiles"
  ON profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Profiles: admins can insert (for invitations)
CREATE POLICY "Admins insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Profiles: users update own
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Profiles: parents see children
CREATE POLICY "Parents view children"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM parent_child pc WHERE pc.parent_id = auth.uid() AND pc.child_id = profiles.id));

-- Profiles: madrichim see group members
CREATE POLICY "Madrichim view group members"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm1
      JOIN group_memberships gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.profile_id = auth.uid()
        AND gm1.role = 'madrich'
        AND gm2.profile_id = profiles.id
    )
  );

-- Groups: everyone can read active groups
CREATE POLICY "Anyone reads groups"
  ON groups FOR SELECT
  USING (is_active = TRUE);

-- Groups: admins manage
CREATE POLICY "Admins manage groups"
  ON groups FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Group memberships: users see own
CREATE POLICY "Users view own memberships"
  ON group_memberships FOR SELECT
  USING (profile_id = auth.uid());

-- Group memberships: admins manage all
CREATE POLICY "Admins manage memberships"
  ON group_memberships FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Group memberships: madrichim see group
CREATE POLICY "Madrichim view group memberships"
  ON group_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.profile_id = auth.uid()
        AND gm.role = 'madrich'
        AND gm.group_id = group_memberships.group_id
    )
  );

-- Parent-child: parents see own
CREATE POLICY "Parents view own children links"
  ON parent_child FOR SELECT
  USING (parent_id = auth.uid());

-- Parent-child: admins manage
CREATE POLICY "Admins manage parent_child"
  ON parent_child FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================
-- Seed initial groups
-- ============================================
INSERT INTO groups (name, slug, area, sort_order) VALUES
  ('SOM', 'som', 'leadership', 1),
  ('Pre-SOM', 'pre-som', 'leadership', 2),
  ('Katan', 'katan', 'katan', 3),
  ('Noar', 'noar', 'noar', 4),
  ('Trips', 'trips', 'special', 5),
  ('Machanot', 'machanot', 'special', 6);
