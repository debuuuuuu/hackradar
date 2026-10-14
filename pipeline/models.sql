-- HackRadar schema (Postgres 18 on Neon). Idempotent: safe to re-run.
-- Later changes go in pipeline/migrations/NNNN_<name>.sql; keep this file as the full current schema.

CREATE EXTENSION IF NOT EXISTS vector;   -- embeddings (pgvector)
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy title matching for dedupe

-- One canonical row per unique hackathon.
-- Dates come from source data only, never AI (D-014). Stored as timestamptz; displayed in IST.
CREATE TABLE IF NOT EXISTS events (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title               text        NOT NULL,
    organizer           text,
    mode                text        CHECK (mode IN ('online', 'offline', 'hybrid')),
    city                text,
    country             text,
    reg_deadline        timestamptz,
    start_date          timestamptz,
    end_date            timestamptz,
    submission_deadline timestamptz,
    prize_text          text,
    themes              text[]      NOT NULL DEFAULT '{}',
    eligibility         text,
    team_size           text,
    invite_only         boolean     NOT NULL DEFAULT false,
    entry_fee           text,                       -- e.g. '₹200'; NULL = free (D-031)
    summary             text,                       -- AI-written
    embedding           vector(768),                -- Gemini embedding, 768 dims
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    status              text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);
CREATE INDEX IF NOT EXISTS events_status_idx       ON events (status);
CREATE INDEX IF NOT EXISTS events_reg_deadline_idx ON events (reg_deadline);
CREATE INDEX IF NOT EXISTS events_title_trgm_idx   ON events USING gin (title gin_trgm_ops);

-- Each listing of an event on a platform. Dedupe merges into one event but keeps every URL.
CREATE TABLE IF NOT EXISTS event_sources (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id      bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    source        text        NOT NULL,             -- devpost | unstop | devfolio | mlh | discovery | ...
    source_id     text        NOT NULL,             -- platform's own id (or URL hash for discovery)
    url           text        NOT NULL,
    raw_json      jsonb,
    content_hash  text        NOT NULL,
    registrations integer,                          -- refreshed every run, not hashed (D-031)
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS event_sources_event_idx ON event_sources (event_id);

-- Owner and friends. Sensitive fields are encrypted by the app before insert (D-024).
CREATE TABLE IF NOT EXISTS users (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                text        NOT NULL,
    discord_user_id     text        UNIQUE,
    email_enc           text,
    callmebot_phone_enc text,
    callmebot_key_enc   text,
    channels            text[]      NOT NULL DEFAULT '{discord}'
                        CHECK (channels <@ ARRAY['discord', 'email', 'whatsapp']),
    digest_enabled      boolean     NOT NULL DEFAULT true,
    timezone            text        NOT NULL DEFAULT 'Asia/Kolkata',
    is_admin            boolean     NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Per-user filters and profile. Offset 0 = same-day morning alert (D-019).
CREATE TABLE IF NOT EXISTS preferences (
    user_id          bigint  PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    themes           text[]  NOT NULL DEFAULT '{}',
    skills           text[]  NOT NULL DEFAULT '{}',
    locations        text[]  NOT NULL DEFAULT '{}',
    modes            text[]  NOT NULL DEFAULT '{online,offline,hybrid}',
    student_only     boolean NOT NULL DEFAULT false,
    min_prize        integer,
    reminder_offsets int[]   NOT NULL DEFAULT '{7,3,1,0}'
);

-- Saves and status.
CREATE TABLE IF NOT EXISTS user_events (
    user_id       bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id      bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    status        text        NOT NULL
                  CHECK (status IN ('saved', 'registered', 'submitted', 'done', 'dismissed')),
    snoozed_until timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS user_events_event_idx ON user_events (event_id);

-- Per-user fit score.
CREATE TABLE IF NOT EXISTS scores (
    user_id   bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id  bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    score     smallint    NOT NULL CHECK (score BETWEEN 0 AND 100),
    reason    text,
    model     text,
    scored_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);

-- Prevents duplicate reminders. date_value is part of the key, so a source date change re-arms reminders.
CREATE TABLE IF NOT EXISTS reminders_sent (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id    bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    date_field  text        NOT NULL
                CHECK (date_field IN ('reg_deadline', 'start_date', 'submission_deadline', 'end_date')),
    date_value  timestamptz NOT NULL,
    offset_days int         NOT NULL,
    channel     text        NOT NULL,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_id, date_field, date_value, offset_days, channel)
);

-- Health of each daily run.
CREATE TABLE IF NOT EXISTS runs (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at         timestamptz NOT NULL DEFAULT now(),
    finished_at        timestamptz,
    trigger            text,                        -- schedule | workflow_dispatch | local
    status             text        NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'success', 'partial', 'failed')),
    source_counts      jsonb       NOT NULL DEFAULT '{}',  -- {"devpost": 120, ...}
    errors             jsonb       NOT NULL DEFAULT '[]',
    ai_calls           int         NOT NULL DEFAULT 0,
    notifications_sent int         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_started_idx ON runs (started_at DESC);
