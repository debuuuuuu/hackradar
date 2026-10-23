-- pipeline/migrations/0015_profile.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS users_handle_idx ON users (handle);
