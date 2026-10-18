-- 2026-10-18 · The sign-in form asks for a name; it rides on the one-time token to the new account. Idempotent. Run BEFORE deploying the web code.
ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS name text;
