-- ============================================
-- Migration 007: Salesforce Integration Enhancements
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS behavioral_notes TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS needs_email BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_sf_account ON profiles(salesforce_account_id);
CREATE INDEX IF NOT EXISTS idx_profiles_sf_contact ON profiles(salesforce_contact_id);
CREATE INDEX IF NOT EXISTS idx_profiles_needs_email ON profiles(needs_email) WHERE needs_email = true;
