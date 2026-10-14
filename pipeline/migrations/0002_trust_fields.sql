-- 2026-10-15 · Trust signals (D-031)
ALTER TABLE events        ADD COLUMN IF NOT EXISTS entry_fee     text;     -- e.g. '₹200'; NULL = free
ALTER TABLE event_sources ADD COLUMN IF NOT EXISTS registrations integer;  -- refreshed every run, not hashed
