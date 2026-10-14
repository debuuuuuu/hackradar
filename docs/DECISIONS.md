# HackRadar — Decision log (ADR-lite)

Append-only. Never delete entries; mark replaced ones `superseded by D-xxx`.
Format: date · decision · why · alternatives rejected · status.

---

### D-001 · ₹0 running cost, free tiers only
- **Date:** 2026-10-14 (planning)
- **Decision:** Every service must have a free tier with no credit card.
- **Why:** Personal/student project that must run indefinitely without cost or billing risk.
- **Alternatives:** Paid APIs (cheap but needs card, ongoing cost) — rejected.
- **Status:** active

### D-002 · No logged-in scraping; robots.txt-allowed public endpoints only
- **Date:** 2026-10-14 (planning)
- **Decision:** Only public APIs and pages robots.txt allows. No cookies, no LinkedIn/X logins, no unofficial WhatsApp libraries. Clear User-Agent, ~1 req/s/host, once a day.
- **Why:** Legal safety, no account bans, and logged-in scraping breaks from datacenter IPs anyway.
- **Alternatives:** Cookie-based scraping (Agent Reach login channels, Playwright with session) — rejected.
- **Status:** active

### D-003 · GitHub Actions cron as the scheduler
- **Date:** 2026-10-14 (planning)
- **Decision:** Daily job runs in GitHub Actions (`schedule` + `workflow_dispatch`).
- **Why:** Free (unlimited minutes on public repos), long runtime allowed, secrets built in.
- **Alternatives:** Vercel cron (Hobby limits frequency and function duration) — rejected; always-on server — costs money.
- **Status:** active

### D-004 · Python 3.12 pipeline
- **Date:** 2026-10-14 (planning)
- **Decision:** Pipeline in Python 3.12 with `httpx`, `selectolax`/BeautifulSoup; Playwright only if unavoidable.
- **Why:** Best scraping/AI ecosystem; Debjit knows it.
- **Alternatives:** Node.js — viable but weaker HTML/data tooling for this use.
- **Status:** active (local machine runs 3.13 — see CONTEXT §6)

### D-005 · Neon Postgres over Supabase
- **Date:** 2026-10-14 (planning)
- **Decision:** Neon free tier (0.5 GB, scales to zero, never pauses).
- **Why:** Supabase free projects pause after ~1 week of inactivity, which breaks a fully automated system.
- **Alternatives:** Supabase (pauses) — rejected; SQLite in repo (no concurrent access from Vercel) — rejected.
- **Status:** active

### D-006 · Gemini for batch AI; provider swappable
- **Date:** 2026-10-14 (planning)
- **Decision:** Gemini Flash / Flash-Lite for summaries/scores/extraction, 10–15 events per call. Groq fallback. Claude possible later. One config value selects the provider via adapters in `pipeline/ai/`.
- **Why:** Generous free tier. Google may use free-tier data for training, so only public event text is sent.
- **Alternatives:** OpenAI (no free API tier) — rejected.
- **Status:** active

### D-007 · Groq for `/ask`
- **Date:** 2026-10-14 (planning)
- **Decision:** Groq answers Discord `/ask`; Gemini is fallback.
- **Why:** Very low latency; free tier.
- **Status:** active

### D-008 · Discovery search: Tavily → Exa → Serper
- **Date:** 2026-10-14 (planning)
- **Decision:** Tavily (1,000 credits/month free) first; Exa via Agent Reach as backup; Serper (2,500 one-time credits) last. ~10 queries/day like `site:linkedin.com/posts hackathon Pune 2026`.
- **Why:** Finds LinkedIn/X posts with no login.
- **Alternatives:** Logged-in LinkedIn/X scraping — rejected (D-002). Google CSE — not evaluated (unverified).
- **Status:** active

### D-009 · Agent Reach: no-login tools only
- **Date:** 2026-10-14 (planning)
- **Decision:** Use only Exa search, Jina Reader and RSS from Agent Reach. Its cookie-based X/LinkedIn/Reddit channels stay off.
- **Why:** Cookie channels risk bans, need fresh cookies every few weeks, and get blocked from GitHub datacenter IPs.
- **Status:** active

### D-010 · Vercel Hobby for bot + dashboard
- **Date:** 2026-10-14 (planning)
- **Decision:** Python serverless function at `/api/interactions` + React/Vite dashboard on Vercel Hobby.
- **Why:** Free, no card, nothing needs to stay running. Hobby is non-commercial — fine for this project.
- **Status:** active

### D-011 · Discord bot via HTTP interactions endpoint
- **Date:** 2026-10-14 (planning)
- **Decision:** Interactions endpoint (no gateway connection) + REST API for sending. Webhook used for the digest in Phase 1 only.
- **Why:** Serverless-friendly; no always-on process.
- **Status:** active

### D-012 · Gmail SMTP for email
- **Date:** 2026-10-14 (planning)
- **Decision:** Gmail SMTP with an App Password (needs 2-Step Verification). ~500 recipients/day.
- **Why:** Free, no card, plenty for a small group.
- **Status:** active

### D-013 · CallMeBot for WhatsApp; Twilio rejected
- **Date:** 2026-10-14 (planning)
- **Decision:** CallMeBot, per-user API key (each user sends a permission message once). Text only.
- **Why:** Free, official-ish opt-in flow, no unofficial libraries.
- **Alternatives:** Twilio sandbox (must rejoin every 3 days) — rejected; unofficial libs (whatsapp-web.js etc.) — rejected (D-002); Meta Cloud API — later stretch goal for a WhatsApp `/ask` bot.
- **Status:** active

### D-014 · Dates and prizes from source data only
- **Date:** 2026-10-14 (planning)
- **Decision:** AI writes summaries, scores and extraction from discovered posts only. Dates/prizes for platform events always come from source data; the link is always shown.
- **Why:** Prevents hallucinated deadlines, the most harmful failure mode.
- **Status:** active

### D-015 · Summarize once per event; score per user
- **Date:** 2026-10-14 (planning)
- **Decision:** Summaries and embeddings are per event; only scoring is per user. Only new/changed events (content hash) go to AI.
- **Why:** Keeps AI calls within free-tier limits as users grow.
- **Status:** active

### D-016 · Monorepo layout
- **Date:** 2026-10-14 (planning)
- **Decision:** One repo with `pipeline/`, `bot/`, `web/`, `tests/`, `config/`, `data/`, `docs/`, `.github/workflows/`.
- **Why:** One shared schema; simple for one developer.
- **Status:** active

### D-017 · Public repo, personal data only in Neon
- **Date:** 2026-10-14
- **Decision:** The GitHub repo is public. No personal data or secrets are ever committed; friends' data lives only in Neon (encrypted where sensitive).
- **Why:** Portfolio value; unlimited free Actions minutes on public repos.
- **Alternatives:** Private (2,000 min/month cap, hidden from portfolio); private-then-public at Phase 6.
- **Status:** active

### D-018 · Digest time ~5 AM IST
- **Date:** 2026-10-14
- **Decision:** Cron `17 23 * * *` UTC (= 04:47 IST). With GitHub's typical 30–60 min delay, the digest lands around 5 AM IST. Odd minute avoids top-of-hour load.
- **Why:** Debjit wants it at 5 AM.
- **Alternatives:** ~6:47 AM IST (`17 1 * * *`, original plan), 8 AM, evening.
- **Consequence:** The run happens on the previous UTC date; all date logic must use IST.
- **Status:** active

### D-019 · Default reminder offsets 7/3/1 + same day
- **Date:** 2026-10-14
- **Decision:** Defaults are 7, 3, 1 days before plus a same-day morning alert. Each user can change theirs (`/reminders`, dashboard).
- **Alternatives:** 3/1 + same day; 14/7/3/1 + same day.
- **Status:** active

### D-020 · Discord `/ask` uses deferred responses
- **Date:** 2026-10-14
- **Decision:** Slow commands (`/ask`, anything hitting a cold Neon) reply with a deferred response (type 5) within 3 s, then send the answer as a follow-up (allowed for 15 min). Phase 4 gate reworded from "answers in under 3 s" to "answers reliably via deferred response; ACK always under 3 s".
- **Why:** Discord's 3 s limit applies only to the initial ACK. Neon cold starts and LLM latency make a sub-3 s full answer fragile.
- **Open risk:** unverified whether a Vercel Python function can keep running after returning the ACK. Spike at the start of Phase 3.
- **Status:** active

### D-021 · Name: HackRadar
- **Date:** 2026-10-14
- **Decision:** Project name is HackRadar. GitHub name availability not checked (unverified).
- **Status:** active

### D-022 · Next source after the core four: Hack2Skill
- **Date:** 2026-10-14
- **Decision:** After Devpost, Unstop, Devfolio, MLH, add Hack2Skill first. Then DoraHacks, HackerEarth.
- **Why:** Strong Indian coverage (Google/government-backed hackathons).
- **Open:** robots.txt and endpoints not yet checked.
- **Status:** active

### D-023 · Keepalive via daily commit to a `status` branch
- **Date:** 2026-10-14
- **Decision:** `daily.yml` commits `data/last_run.json` to a separate `status` branch every run, keeping `main` history clean.
- **Why:** GitHub disables scheduled workflows on public repos after 60 days without repository activity.
- **Open risk:** unverified that commits on a non-default branch count as activity. Verify in Phase 0; fallback is commits to `main` (original plan) or a periodic "enable workflow" API call.
- **Alternatives:** Daily commit to `main` (~365 bot commits/year); monthly re-enable via API (more moving parts).
- **Status:** active

### D-024 · Personal data encrypted at rest
- **Date:** 2026-10-14 (planning)
- **Decision:** CallMeBot keys and emails encrypted with a key held in GitHub Secrets / Vercel env. Personal data never sent to AI.
- **Status:** active

### D-025 · Python 3.12 managed by uv
- **Date:** 2026-10-14
- **Decision:** Python 3.12 everywhere (local + CI), managed by `uv`: `.python-version` pins 3.12, `uv.lock` locks deps, CI runs `uv sync --frozen`.
- **Why:** Matches the plan and CI; 3.12 was already installed locally; uv is fast and gives reproducible installs.
- **Alternatives:** 3.13 everywhere; plain pip + venv + requirements.txt.
- **Status:** active (resolves the 3.12 vs 3.13 open issue)

### D-026 · Schema details for models.sql
- **Date:** 2026-10-14
- **Decision:**
  - Dates stored as `timestamptz`; displayed in IST.
  - `embedding vector(768)` via pgvector (Gemini embeddings requested at 768 dims; exact model chosen in Phase 4).
  - `pg_trgm` GIN index on `events.title` for fuzzy dedupe in SQL.
  - Encrypted user fields stored as text tokens in `*_enc` columns (encrypted by the app, D-024).
  - Reminder offset `0` = same-day morning alert; default `{7,3,1,0}`.
  - `reminders_sent` unique key includes `date_value`, so a source date change re-arms reminders.
  - `event_sources` unique on `(source, source_id)`.
  - `models.sql` is idempotent (`IF NOT EXISTS`) and always holds the full current schema; later changes also go in `pipeline/migrations/NNNN_*.sql`.
- **Why:** Keep dedupe and similarity inside Postgres (no extra services); make reminders correct when dates move.
- **Alternatives:** float arrays for embeddings (no index); Alembic migrations (heavier than needed now).
- **Status:** active

### D-027 · Pin GitHub Actions to existing tags; setup-uv to exact version
- **Date:** 2026-10-14
- **Decision:** `actions/checkout@v7`, `astral-sh/setup-uv@v10.2.0` (exact; that repo publishes no floating major tag). Prefer releases ≥ 2 weeks old.
- **Why:** `@v10` failed to resolve; exact pins are also safer against supply-chain changes.
- **Status:** active

### D-029 · Protego for robots.txt parsing
- **Date:** 2026-10-14
- **Decision:** `PoliteClient` parses robots.txt with Protego instead of `urllib.robotparser`.
- **Why:** Unstop's robots.txt relies on `*` wildcards and longest-match precedence (`Allow: /api/public/*` vs `Disallow: /api/*`). The stdlib parser supports neither and reported disallowed paths (`/api/private/x`, `/competitions/*/register`) as allowed. Protego (Scrapy's parser, RFC 9309) handled every test case correctly. Covered by `test_robots_wildcards_and_longest_match`.
- **Alternatives:** stdlib parser (wrong); hand-written matcher (more code to maintain).
- **Status:** active

### D-028 · Date-only source values stored as 00:00 IST; Devpost mapping
- **Date:** 2026-10-14
- **Decision:** When a source gives only a date (Devpost), store it as `timestamptz` at 00:00 IST of that day and show the date only. An event closes when its last known date is before the start of today (IST), so it stays open on its deadline day. Devpost: submission period → `start_date` + `submission_deadline` (= `end_date`); `reg_deadline` null (registration stays open until the submission deadline); location free text → `city`.
- **Why:** Devpost exposes only display text like "Aug 31 - Oct 23, 2026"; the exact time and timezone are unknown, and inventing them would break D-014.
- **Alternatives:** a `date` column (other sources such as Unstop may give exact times); 23:59 IST (could show an event as open after a US-time deadline has already passed in IST).
- **Status:** active
