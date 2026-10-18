-- 2026-10-18 · "Sign out everywhere": session cookies issued before this time are refused. Idempotent. Run BEFORE deploying the web code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_after timestamptz;
