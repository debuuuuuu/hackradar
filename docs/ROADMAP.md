# HackRadar — Roadmap

_Last updated: 2026-10-22_ · ~8 weeks part-time (evenings and weekends; estimates).

Each phase ends at a **gate**. Don't start the next phase until the gate passes, so there is always a
working version. Status: ⬜ not started · 🟨 in progress · ✅ done.

## Product plan (approved 2026-10-23)

The [product design](superpowers/specs/2026-10-23-hackradar-product-design.md) sets the build order from here.
It overlaps the phases below; each step gets its own plan before building.

- [ ] Step 1 · "For you" picks: busy dates in Settings, rule filters, AI score + "why" line (D-051) — Phase 2
- [ ] Step 2 · Save / Register / Add to Google Calendar + reminders — Phase 3
- [ ] Step 3 · Public profile `/u/<handle>`: ○ ● ★ grid, counts, Terms + 18+ checkbox (D-050), Terms page
- [ ] Step 3b · Leaderboard `/leaderboard` (D-052)
- [ ] Step 4 · Interest map for recruiters
- [ ] Step 5 · LinkedIn / X discovery — Phase 4
- [ ] Later · Teammate finder, recruiter search, Google Calendar free/busy

## Phase 0 · Setup (week 1) — ✅ gate passed 2026-10-14

**Gate:** a manual run of `daily.yml` passes green.

- [x] Docs system: `CLAUDE.md` + `docs/` structure filled from planning (2026-10-14)
- [x] Resolve open decisions (repo visibility, digest time, offsets, name, next source, keepalive) (2026-10-14)
- [x] Decide local Python version → 3.12 via uv (D-025) (2026-10-14)
- [x] Create public GitHub repo `debuuuuuu/hackradar`, push `main` (2026-10-14)
- [x] Folder skeleton: `pipeline/`, `tests/`, `config/`, `.github/workflows/` (`bot/`, `web/` created in Phases 3/5) (2026-10-14)
- [x] `pyproject.toml` with deps + `ruff`/`black`/`pytest` config, `uv.lock` (2026-10-14)
- [x] `config/sources.yaml` and `config/settings.yaml` (2026-10-14)
- [x] `.env.example` with every variable name (2026-10-14)
- [x] Neon project created via MCP; `DATABASE_URL` in `.env` + GitHub secret (2026-10-14)
- [x] Discord webhook (2026-10-15)
- [x] `pipeline/models.sql` (all 8 tables) applied on Neon (D-026) (2026-10-14)
- [x] `pipeline/run.py` skeleton (writes `runs` row + `data/last_run.json`) (2026-10-14)
- [x] `.github/workflows/daily.yml`: cron `17 23 * * *` + dispatch + keepalive to `status` branch (2026-10-14)
- [x] `.github/workflows/ci.yml`: ruff, black --check, pytest (2026-10-14)
- [x] Research note on `status`-branch activity — still unverified, fallback planned (github-cron note) (2026-10-14)
- [x] **Gate:** manual `workflow_dispatch` run of `daily.yml` is green — run 38579261227 (2026-10-14)

## Phase 1 · MVP digest (weeks 1–2) — ✅ gate met (daily runs green 2026-10-16 to 2026-10-22; Discord channel contents not re-verified)

**Gate:** a real digest arrives on Discord 3 days in a row.

- [x] `sources/base.py`: `Source` interface + polite HTTP client (User-Agent, retries/backoff, ~1 req/s/host, robots check) (2026-10-14)
- [x] `sources/devpost.py` with pagination (40/page) + fixture test; 48 live events stored (2026-10-14)
- [x] `sources/unstop.py` (`/api/public/*` only) + fixture test; 250 live events stored (2026-10-14)
- [x] robots.txt parsing switched to Protego (wildcards, longest match) (D-029) (2026-10-14)
- [x] `normalize.py`: `EventRecord`, date ranges → IST, prize cleaning, content hash + tests (2026-10-14)
- [x] `db.py`: upsert into `events` and `event_sources` (new/changed/same via content hash) (2026-10-14)
- [x] Mark past events closed (IST day boundary) (2026-10-14)
- [x] `notify/discord.py` + `digest.py`: webhook digest (New / Closing ≤3 days, sorted by deadline, no AI), "nothing new" message, Discord size limits, 429 retry (D-030) (2026-10-14)
- [x] `DISCORD_WEBHOOK_URL` in `.env` + GitHub secret; first live digest delivered, run 7 (2026-10-15)
- [x] Wire everything in `run.py`; per-source and Discord failures logged, never fatal (2026-10-14)
- [x] Cron + keepalive live (scheduled runs green every day 2026-10-16 to 2026-10-22)
- [x] Fix digest "new" cutoff (last run that sent a digest, by finished_at) (2026-10-15)
- [x] Trust signals on digest lines: organiser, 👥 registrations, 💰 fee / 🔒 invite-only / ⚠️ flags (D-031) (2026-10-15)
- [x] Batch upserts per source (one lookup + pipelined writes); store failure skips only that source (2026-10-15)
- [x] Watch 3 daily runs; fix anything flaky (runs 12–13 had a missing-column error; fixed 2026-10-18 with migrations 0009–0012)
- [x] **Gate:** 3 consecutive real digests on Discord (runs green; channel contents not re-verified)

## Phase 2 · AI + more sources (week 3) — ⬜

**Gate:** the digest is ranked and no event is listed twice.

- [x] `ai/` provider interface + `groq.py` with retry/429 handling and tests (D-035) (2026-10-15)
- [ ] `gemini.py` (optional), `claude.py` stub
- [x] Summarize: `ai/summarize.py` (batched, rule-checked: no dates/money, untrusted-text delimiters), tested live on 12 events (2026-10-15)
- [x] `enrich.py`: summary + kind stored for new/changed events, paced, saved per batch, never fatal; wired into `run.py` (D-036) (2026-10-15)
- [x] Digest uses `kind` (hackathons by default, contests in their own section) and shows `summary`
- [ ] Score prompt (per-user, after preferences exist)
- [ ] Batch summaries (10–15 events/call), only new/changed events; retry with backoff on 429
- [ ] Per-user scoring for the owner (rule filters first, then AI score)
- [x] `sources/devfolio.py` + fixture test
- [ ] `sources/mlh.py` (`www.mlh.com/seasons/2027/events` embedded JSON; filter IN + online) + fixture test
- [x] `dedupe.py`: fuzzy title + organizer + overlapping dates; keep all source URLs; tests
- [x] "Listed on 2+ platforms" trust badge from dedupe (D-031)
- [ ] `sources/luma.py`: curated calendar ICS feeds, hackathon keyword + future filter, fixture test (D-033)
- [x] Place preferences + filter: static city table + radius (D-038); per-user prefs come with Phase 3
- [x] `notify/email.py`: Gmail SMTP HTML digest, with one-click unsubscribe (D-049) (2026-10-18)
- [ ] Digest sections: top 5, closing ≤3 days, AI picks, other options
- [ ] **Gate:** ranked digest, zero duplicates over a week of runs

## Phase 3 · Saves + reminders (week 4) — ⬜

**Gate:** a saved event gets its 7/3/1-day reminders.

- [ ] "Add to Google Calendar" link on digest items and emails (D-032)
- [ ] Per-user calendar feed (`.ics`, tokenized URL) of saved events + `/calendar` command (D-032)

- [ ] **Spike first:** Vercel Python function + Discord deferred response + follow-up (D-020)
- [ ] `bot/` Vercel function `/api/interactions`: signature verification, PING, button handlers
- [ ] Discord bot (not webhook) digest with ⭐ Save / ✖ Not interested buttons
- [ ] `/save`, `/status`, `/saved` commands
- [ ] `reminders.py`: offsets per status (Saved → reg deadline; Registered → start + submission), `reminders_sent` dedupe
- [ ] Reminder buttons: Mark registered, Snooze 1 day
- [ ] `/reminders 7,3,1` command
- [x] `notify/whatsapp.py`: CallMeBot text (built; first live WhatsApp send unverified)
- [x] Encryption of CallMeBot keys and emails at rest (D-024)
- [ ] **Gate:** a saved test event receives its 7/3/1 + same-day reminders

## Phase 4 · Discovery + smarts (week 5) — ⬜

**Gate:** `/ask` answers correctly via deferred response, ACK always < 3 s (D-020).

- [ ] Discovery filter (Debjit 2026-10-15): drop anything not in the future (IST), older than ~90 days, or without a registration link; never show finished hackathons
- [ ] Test Exa no-key access from a GitHub Actions runner; research note
- [ ] `sources/discovery.py`: Tavily (~10 queries/day) → Exa → Serper; Jina Reader fetch
- [ ] AI extraction prompt for discovered posts; drop posts without a registration link
- [ ] Embeddings (Gemini) + TF-IDF fallback
- [ ] Ranking: blend AI score with similarity to saves, away from dismissals
- [ ] "Because you saved X" digest lines
- [ ] `/ask` with Groq + small DB context
- [ ] `/filters`, `/digest now`, `/pause`, `/resume`
- [ ] **Gate:** `/ask` reliable under deferred flow

## Phase 5 · Dashboard + friends (weeks 6–7) — ⬜

**Gate:** 3 friends get their own digests and reminders.

- [x] `web/` React + Vite app on Vercel (live at hackradar-two.vercel.app; GitHub pushes to `main` deploy it)
- [ ] Discord OAuth login (built but disabled — needs `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` on Vercel)
- [ ] Pages: All events, Saved, Deadline calendar, Settings, Admin health
- [ ] `/join` command + onboarding flow
- [x] Per-user filters, channels, offsets; Discord webhook and CallMeBot key in Settings
- [ ] Email status links (signed tokens)
- [ ] **Gate:** 3 friends receiving personal digests and reminders

## Phase 6 · Portfolio polish (week 8) — ⬜

**Gate:** the repo is public-ready and the demo is ready.

- [ ] Test coverage pass; CI green
- [ ] Health alerts: source 0 results 2 days running, run failure → Discord
- [ ] Admin health page complete
- [ ] README, architecture diagram, demo GIF
- [ ] Add Hack2Skill source (D-022)
- [ ] Secret scan of full git history before promoting the repo
- [ ] Confirm the `status`-branch keepalive kept the cron alive past 60 quiet days, or switch to fallback (D-023)
- [ ] **Gate:** public repo polished, demo ready
