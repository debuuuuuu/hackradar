# HackRadar — Claude Code instructions

**Before doing anything, read `docs/CONTEXT.md`.** Then read only the sub-docs the current task needs.

HackRadar is a free, fully automated daily hackathon digest (Discord, email, WhatsApp) with AI ranking,
saves and reminders, for Debjit and friends. Full context lives in `docs/`.

## Documentation protocol (follow every session, unprompted)

**Session start**
1. Read `CLAUDE.md` → `docs/CONTEXT.md` → only the sub-docs the task needs.
2. Tell Debjit in 2–3 lines where we are and what you'll do next.

**During work**
- New finding (API behaviour, free-tier limit, tool tested, bug root cause) → create or append
  `docs/research/YYYY-MM-DD-<topic>.md` and add it to `docs/research/README.md`.
- Decision made or changed → append to `docs/DECISIONS.md` (date, decision, why, alternatives, status).
  Never delete entries; mark old ones `superseded`.
- Task finished → tick it in `docs/ROADMAP.md`.
- Spec or architecture changed → update the doc in the **same commit** as the code.

**Session end, or when Debjit says "wrap up" / "save context" / "handoff"**
1. Write `docs/sessions/YYYY-MM-DD-<title>.md`: goal, done, files changed, decisions, findings, problems, next steps.
2. Rewrite "Resume here" and "Current status" in `docs/CONTEXT.md`.
3. Update the doc index in `docs/CONTEXT.md` and the `README.md` in `research/` and `sessions/`.
4. Commit docs: `docs: session handoff <YYYY-MM-DD>`.

**Doc quality**
- Facts, not chat. Include dates. Mark anything not verified as **unverified**.
- Free-tier limits and API behaviour: always record an "as of" date and source URL.
- Never put secrets, API keys, or friends' personal data in docs.
- If code and docs disagree, flag it to Debjit and fix the docs.
- Keep `docs/CONTEXT.md` under ~400 lines; move detail into sub-docs.

## Hard constraints

- **Built for real scale (D-044, 2026-10-16).** Assume 1,000 to 1M users, not a friends group. Start on free tiers, but no hard ₹0 limit; never pick something that cannot be upgraded.
- **Fully automated** after one-time setup.
- **Legal, safe sourcing.** Public APIs and robots.txt-allowed pages only. No logged-in scraping:
  no cookies, no LinkedIn/X logins, no unofficial WhatsApp libraries. Agent Reach login channels stay off.
- **Swappable AI provider** via one config value (Gemini now, Groq fallback, Claude later).
- **No personal data sent to AI.** Only public event text.
- **Dates and prizes come from source data, never from AI.** AI writes summaries, scores, and
  extraction from discovered posts only; the source link is always shown.
- Secrets only in GitHub Secrets, Vercel env vars, and a gitignored local `.env`.
- Before adding any external service: confirm free with no card, write a research note, log a decision.

## Coding conventions

- Python 3.12 (CI target), type hints, `ruff` + `black`, `pytest`.
- Each source implements one `Source` interface and fails independently (logged, never fatal).
- Polite HTTP: clear User-Agent, ~1 req/s per host, retries with backoff, robots.txt respected.
- Config in YAML (`config/`). Secrets only from env vars. Keep `.env.example` current.
- Every scraper gets a fixture test built from a saved real response (`tests/fixtures/`).
- All "today"/date logic uses IST (`Asia/Kolkata`), not UTC; the cron fires at 23:17 UTC on the previous UTC day.
- Small commits, conventional messages: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Work in phases; don't start the next phase until the current gate passes (`docs/ROADMAP.md`).

## Common commands

Python 3.12 managed by `uv` (pinned in `.python-version`, locked in `uv.lock`).

```bash
uv sync                                   # install deps into .venv
uv run python -m pipeline.db init         # apply pipeline/models.sql to DATABASE_URL (idempotent)
uv run python -m pipeline.run             # run the daily pipeline locally (reads .env)
uv run pytest -q                          # tests (DB tests skip unless TEST_DATABASE_URL is set; CI has a pgvector service; they use a throwaway schema)
uv run ruff check . && uv run black --check .   # lint
gh workflow run daily.yml && gh run watch # trigger the daily job manually
cd web && npm test                        # web tests: needs TEST_DATABASE_URL; run in an isolated schema, a leak guard checks public tables
```
