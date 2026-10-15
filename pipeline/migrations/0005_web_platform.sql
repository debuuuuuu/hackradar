-- 2026-10-15 · Web platform: accounts, onboarding preferences, logins, places, event coordinates.
-- Idempotent and self-sufficient: safe on the old table shapes and safe to re-run.
-- preferences.themes (existing) is the topic list.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at  timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_key ON users (email_hash);

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS home_city text NOT NULL DEFAULT 'pune';
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS radius_km int  NOT NULL DEFAULT 150;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'online_near'
    CHECK (format IN ('online_near', 'online', 'in_person', 'anything'));
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS priorities jsonb NOT NULL
    DEFAULT '{"hackathon":"top","contest":"normal","workshop":"off","fest":"off"}';
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS include_social boolean NOT NULL DEFAULT true;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS channels jsonb NOT NULL
    DEFAULT '{"digest":["email","discord"],"ping":["discord"],"reminders":["email","discord"]}';

CREATE TABLE IF NOT EXISTS logins (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    method  text        NOT NULL CHECK (method IN ('discord', 'email')),
    at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logins_at_idx ON logins (at);

CREATE TABLE IF NOT EXISTS login_tokens (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email_hash text        NOT NULL,
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
    key  text PRIMARY KEY,
    name text,
    lat  float8,
    lon  float8
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS lat float8;
ALTER TABLE events ADD COLUMN IF NOT EXISTS lon float8;
