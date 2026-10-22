# Migrations

`pipeline/models.sql` is the full current schema (idempotent, applied with `uv run python -m pipeline.db init`).

Schema changes after the initial setup go here as `NNNN_<name>.sql` (e.g. `0002_add_result_date.sql`),
and `models.sql` is updated in the same commit so it always reflects the current schema.

## Applied to the live Neon database (`hackradar` project)
| Migration | Applied |
|---|---|
| 0009 login IP limit, 0010 Google login, 0011 sessions_valid_after, 0012 login_tokens.name | 2026-10-18 |
Earlier migrations were applied as they shipped. Record each new one here when you run it.

## Pending (not yet applied to Neon)
- 0013 busy_periods: not yet applied to Neon. Apply it before the web busy-dates API goes live; the daily digest still works without it (picks are skipped if the busy query fails).
