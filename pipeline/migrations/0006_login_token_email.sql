-- 2026-10-15 · Email sign-in: the one-time token carries the encrypted address so the user
-- row can be created when the link is clicked. Idempotent.
ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS email_enc text;
