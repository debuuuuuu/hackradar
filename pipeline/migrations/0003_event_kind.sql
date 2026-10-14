-- 2026-10-15 · AI-assigned event kind (D-036). summary already exists from 0001.
ALTER TABLE events ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('hackathon', 'contest', 'other'));
