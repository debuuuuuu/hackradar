-- 2026-10-15 · Owner approves each new account (D-041). NULL = pending: no digest, no saves.
-- Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamptz;
