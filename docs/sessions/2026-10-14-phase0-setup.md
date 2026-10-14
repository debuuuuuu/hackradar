# Session 2026-10-14 — Phase 0 setup

## Goal
Complete Phase 0 and pass its gate: a manual run of `daily.yml` passes green.

## Done
- Decided Python 3.12 via uv (D-025). Initial docs commit `5f850ce`.
- Created public repo https://github.com/debuuuuuu/hackradar; workflow permissions → read/write.
- Created Neon project `hackradar` (`proud-bar-84693777`, Singapore, PG 18) via Neon MCP; `DATABASE_URL` →
  `.env` + GitHub secret.
- Wrote and applied `pipeline/models.sql` (8 tables, pgvector, pg_trgm) (D-026).
- `pipeline/db.py` (connect, apply_schema, start/finish run; `python -m pipeline.db init`), `pipeline/run.py`
  (runs row + `data/last_run.json`, IST date), `tests/test_run.py` (2 tests).
- `config/settings.yaml`, `config/sources.yaml`, `.env.example`, `pipeline/migrations/README.md`.
- `.github/workflows/daily.yml` (cron `17 23 * * *`, dispatch, keepalive to orphan `status` branch) and `ci.yml`.
- **Gate passed:** run 38579261227 green; `status` branch has `data/last_run.json`; `runs` rows 1 (local) and 2 (Actions).

## Files changed
`pyproject.toml`, `uv.lock`, `.python-version`, `.gitignore`, `.env.example`, `CLAUDE.md` (commands),
`pipeline/{__init__,db,run}.py`, `pipeline/models.sql`, `pipeline/migrations/README.md`, `tests/*`, `config/*`,
`.github/workflows/{daily,ci}.yml`, docs (CONTEXT, ROADMAP, DECISIONS, SETUP, research notes, sessions).

## Decisions
D-025 (uv + 3.12), D-026 (schema details), D-027 (Action pins).

## Findings
- `astral-sh/setup-uv` has no floating `v10` tag → first runs failed at "Set up job"; pinned `v10.2.0`.
- pgvector 0.8.6 and pg_trgm available on Neon free; Neon reports 1 GiB branch limit.
- Whether a non-default-branch commit counts as "repository activity" is still unverified.
- `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19.

## Problems
- First daily + ci runs failed (setup-uv tag) — fixed in `fix: pin setup-uv to v10.2.0`.

## Next steps
1. Debjit: create Discord webhook → `DISCORD_WEBHOOK_URL` (`.env` + `gh secret set`).
2. `sources/base.py` polite HTTP client (add `httpx`), robots.txt check.
3. `sources/devpost.py` + saved fixture + test; verify Devpost robots.txt and record in `specs/sources.md`.
