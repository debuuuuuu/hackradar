-- 2026-10-23 · Busy periods for the For you picks clash flag. Idempotent.
CREATE TABLE IF NOT EXISTS busy_periods (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id   bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    starts_on date   NOT NULL,
    ends_on   date   NOT NULL,
    label     text   NOT NULL,
    CHECK (starts_on <= ends_on)
);
CREATE INDEX IF NOT EXISTS busy_periods_user_idx ON busy_periods (user_id);
