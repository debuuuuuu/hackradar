-- 2026-10-15 · Per-user delivery: a user's own Discord webhook (encrypted) and a send-once ledger.
-- Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_webhook_enc text;

-- One row per (user, IST day, channel) once a message is sent, so a re-run never sends twice.
CREATE TABLE IF NOT EXISTS sends (
    user_id  bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    ist_date date        NOT NULL,
    channel  text        NOT NULL CHECK (channel IN ('discord', 'email', 'whatsapp')),
    status   text        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
    sent_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, ist_date, channel)
);
