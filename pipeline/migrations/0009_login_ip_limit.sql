-- 2026-10-16 · Per-IP sign-in link limit (D-044). Idempotent. Run BEFORE deploying the web code that writes ip_hash.
ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS ip_hash text;
CREATE INDEX IF NOT EXISTS login_tokens_ip_idx ON login_tokens (ip_hash, created_at);
