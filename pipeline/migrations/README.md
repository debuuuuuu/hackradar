# Migrations

`pipeline/models.sql` is the full current schema (idempotent, applied with `uv run python -m pipeline.db init`).

Schema changes after the initial setup go here as `NNNN_<name>.sql` (e.g. `0002_add_result_date.sql`),
and `models.sql` is updated in the same commit so it always reflects the current schema.
