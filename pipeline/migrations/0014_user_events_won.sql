-- 0014 · 2026-10-23 · Add won flag and project_url to user_events. Idempotent.
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS won         bool NOT NULL DEFAULT false;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS project_url text;
