# Migrations

`pipeline/models.sql` is the full current schema (idempotent, applied with `uv run python -m pipeline.db init`).

Schema changes after the initial setup go here as `NNNN_<name>.sql` (e.g. `0002_add_result_date.sql`),
and `models.sql` is updated in the same commit so it always reflects the current schema.

## Applied to the live Neon database (`hackradar` project)
| Migration | Applied |
|---|---|
| 0009 login IP limit, 0010 Google login, 0011 sessions_valid_after, 0012 login_tokens.name | 2026-10-18 |
| 0013 busy_periods (table + user index) | 2026-10-23 |
| 0014 user_events.won + project_url | 2026-10-23 |
Earlier migrations were applied as they shipped. Record each new one here when you run it.
