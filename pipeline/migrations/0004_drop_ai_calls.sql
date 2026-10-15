-- 2026-10-15 · runs.ai_calls was never written (always 0); removed.
ALTER TABLE runs DROP COLUMN IF EXISTS ai_calls;
