# HackRadar — CONTEXT (single source of truth)

_Last updated: 2026-10-15_

## 1. Resume here

- **Phase:** 1 · MVP digest, in progress. Phase 0 gate passed 2026-10-14.
- **Just finished (2026-10-15):** digest now shows AI summaries and a separate "Contests & other" section (kind filter, 52 tests); first live Discord digest; "new" cutoff fix; trust signals (D-031); batched
  upserts (run 155 s → 15 s); calendar plan (D-032); Luma via ICS (D-033); place filter (D-034); dashboard design
  direction D (canvas https://claude.ai/artifact/SDLHqTM56wgrjpXHTgdbAx, private); Phase 2 source research.
  34 tests green.
- **Next task:** check each 04:47 IST cron digest on 15, 16, 17 Oct (Phase 1 gate): `gh run list --workflow
  daily.yml`, the Discord channel, the `runs` table. Fix anything flaky. Then Phase 2 (ROADMAP).
- **Blockers for Phase 2 (Debjit):** Groq API key (console.groq.com; if it asks for a card, stop) and Gmail app password → `.env`; Claude
  copies them to GitHub Secrets with `gh secret set` (never pasted in chat).
- **Watch out:** cron fires 23:17 UTC = next IST day; use IST for all "today" logic.

## 2. Project summary

HackRadar is a free, fully automated system that runs once a day. It:

- collects open hackathons from Indian and global platforms (Devpost, Unstop, Devfolio, MLH; Hack2Skill next),
- discovers hackathon announcements on LinkedIn/X through search APIs, with no logins,
- summarizes them with AI and ranks them against each user's interests,
- sends a per-user digest to Discord, email and WhatsApp,
- reminds users about saved events as key dates get close,
- learns from what each user saves and dismisses.

Friends and college peers can join with their own filters, saves and reminders. It is also a portfolio piece.

**Owner:** Debjit (ETC engineering student, Pune; React, Node.js, Python, AI/LLM, blockchain).

**Hard constraints**
- ₹0 running cost; free tiers only; no credit card anywhere.
- Fully automated after a one-time setup (~30 min).
- Legal, safe sourcing: public APIs and robots.txt-allowed pages only; no logged-in scraping, no cookies,
  no unofficial WhatsApp libraries.
- AI provider swappable via one config value (Gemini → Groq → Claude later).
- No personal data sent to AI; only public event text.
- Dates and prizes always from source data, never AI.
- Secrets only in GitHub Secrets, Vercel env vars, and gitignored `.env`.

**Out of scope for v1:** paid APIs, logged-in scraping, unofficial WhatsApp libraries, commercial use.

## 3. Current status

| Phase | Name | Gate | Status |
|---|---|---|---|
| 0 | Setup | Manual run of `daily.yml` passes green | ✅ passed 2026-10-14 |
| 1 | MVP digest | Real digest on Discord 3 days in a row | 🟨 in progress |
| 2 | AI + more sources | Digest ranked, no event listed twice | ⬜ |
| 3 | Saves + reminders | Saved event gets its 7/3/1-day reminders | ⬜ |
| 4 | Discovery + smarts | `/ask` answers reliably (see D-020) | ⬜ |
| 5 | Dashboard + friends | 3 friends get their own digests and reminders | ⬜ |
| 6 | Portfolio polish | Repo public-ready, demo ready | ⬜ |

**Working end to end right now:** `daily.yml` (manual or cron) → `python -m pipeline.run` fetches Devpost and
Unstop (robots-checked, polite), batch-upserts into `events`/`event_sources`, closes past events, writes a `runs` row and
`data/last_run.json` → keepalive commit to `status` branch. Builds and sends the Discord digest (webhook live since 2026-10-15).
CI (ruff, black, pytest) green on `main`.

## 4. Stack at a glance

| Layer | Choice | Fallback / notes |
|---|---|---|
| Scheduler | GitHub Actions cron `17 23 * * *` UTC (04:47 IST) + `workflow_dispatch` | Runs often 30–60 min late → digest lands ~5 AM IST |
| Keepalive | Daily commit of `last_run.json` to a `status` branch | Unverified that a non-default-branch commit counts; test in Phase 0 |
| Pipeline | Python 3.12 via `uv` (D-025), `psycopg` 3, `httpx`, `selectolax`/BeautifulSoup | Playwright only if unavoidable |
| Sources | Devpost ✅, Unstop ✅ (`/api/public/*`), Devfolio, MLH | Next: Hack2Skill; later DoraHacks, HackerEarth |
| LinkedIn/X discovery | Tavily (1,000 credits/mo) | Exa via Agent Reach → Serper (2,500 one-time) |
| Page reading | Jina Reader (via Agent Reach) | Agent Reach login channels OFF |
| AI batch | Gemini Flash / Flash-Lite, 10–15 events/call | Groq |
| AI `/ask` | Groq | Gemini |
| Embeddings | Gemini embedding model | TF-IDF on themes |
| Database | Neon Postgres 18 free, project `hackradar` (Singapore), pgvector + pg_trgm | — (Supabase rejected) |
| Bot + dashboard | Vercel Hobby: Python fn `/api/interactions` + React/Vite | — |
| Discord | Bot via interactions endpoint + REST | Webhook for digest only (Phase 1) |
| Email | Gmail SMTP + App Password | — |
| WhatsApp | CallMeBot (per-user key, text only) | Discord + email; Meta Cloud API later stretch |

## 5. Key decisions

Full log with reasons and alternatives: [DECISIONS.md](DECISIONS.md).

- D-001 ₹0 cost, free tiers only, no card.
- D-002 No logged-in scraping; robots.txt-allowed public endpoints only.
- D-003 GitHub Actions cron as the scheduler (not Vercel cron).
- D-004 Python 3.12 pipeline.
- D-005 Neon Postgres over Supabase (Supabase free pauses after 1 week idle).
- D-006 Gemini for batch AI, Groq fallback; provider swappable via config.
- D-007 Groq for `/ask`.
- D-008 Tavily → Exa → Serper for LinkedIn/X discovery.
- D-009 Agent Reach: only no-login tools (Exa, Jina Reader, RSS).
- D-010 Vercel Hobby for bot + dashboard.
- D-011 Discord bot via HTTP interactions endpoint.
- D-012 Gmail SMTP for email.
- D-013 CallMeBot for WhatsApp; Twilio rejected.
- D-014 Dates/prizes from source data only; AI never invents them.
- D-015 Summarize once per event; score per user.
- D-016 Monorepo layout (pipeline / bot / web).
- D-017 Public repo; all personal data only in Neon.
- D-018 Digest time ~5 AM IST (cron 23:17 UTC).
- D-019 Default reminder offsets 7/3/1 days + same-day morning.
- D-020 Discord `/ask` uses deferred response; Phase 4 gate reworded.
- D-021 Name: HackRadar.
- D-022 Next source after core four: Hack2Skill.
- D-023 Keepalive via daily commit to a `status` branch.
- D-024 Personal data (CallMeBot keys, emails) encrypted at rest.
- D-025 Python 3.12 managed by uv.
- D-026 Schema details (timestamptz, vector(768), pg_trgm, offset 0 = same day, date_value in reminder key).
- D-027 Pin Actions tags; setup-uv exact version.
- D-028 Date-only source values stored as 00:00 IST; Devpost field mapping.
- D-029 Protego for robots.txt (stdlib parser mishandles wildcards).
- D-030 Phase 1 digest format (closing ≤3 days + new, by deadline).
- D-031 Event trust signals from source fields (fee, invite-only, organiser, registrations); Supabase rejected.
- D-032 Calendar: Google template links + per-user ICS feed; no Calendar API.
- D-033 Luma via curated calendar ICS feeds only (terms forbid unsupported interfaces).
- D-034 Place filter: home city + radius + metro areas.
- D-035 Groq is the default batch AI provider (Gemini optional); no embeddings from Groq.
- D-036 Daily enrichment: AI summary + kind (hackathon/contest/other) stored per event; digest doesn't use them yet.

## 6. Known issues and open questions

- **Keepalive on `status` branch: mechanics verified, activity rule unverified** — GitHub docs don't define
  "repository activity". Risk only after 60 quiet days on `main`; fallback planned (D-023, Phase 6 task).
- **`ubuntu-latest` → Ubuntu 26 from 2026-10-19** — watch the first runs after that date.
- **Date boundary:** cron fires 23:17 UTC = 04:47 IST the next day. All "today" logic must use IST.
- **Devpost `/api/hackathons` is undocumented** (it's what devpost.com's own frontend calls). May change
  without notice; fixture tests + zero-results alert cover it.
- **MLH listing** is `www.mlh.com/seasons/2027/events` (embedded JSON); only 1 of 66 upcoming events in India.
- **Luma terms** allow only "publicly supported interfaces" → curated calendar ICS feeds only (D-033).
- **GeoNames download server disallows all bots** → never fetch at runtime; one-time manual download if chosen.
- **City names from sources are messy** (West/New/East Delhi, Bangalore Urban) → normalise for the place filter.
- **Neon cold start** after scale-to-zero is ~hundreds of ms to a few seconds (unverified exact number),
  not "ms". Matters for Discord commands → use deferred responses (D-020).
- **Vercel Python + deferred Discord replies:** unverified whether a Python function can keep working after
  sending the deferred ACK. Test early in Phase 3. If not, the follow-up must be produced within the same
  request before ACK, or work moved elsewhere.
- **Exa no-key access from GitHub Actions IPs** is unverified; test in Phase 4.
- **Hack2Skill robots.txt / endpoints** not yet checked.
- **Upsert speed:** fixed 2026-10-15 with batched upserts (whole local run 155 s → 15 s).
- **Cross-platform duplicates exist** (Multimodal AI on Devpost + Unstop, different deadlines) → Phase 2 dedupe.
- **Unstop listing lacks event start date and submission deadline** — only registration deadline and end date.
- **Neon storage limit:** API reports 1 GiB branch limit; plan says 0.5 GB — budget for 0.5 GB until checked.
- All free-tier numbers in research notes are as of 2026-10-14 from the planning session and marked unverified
  until re-checked against official pages.

## 7. Doc index

| Doc | Purpose |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Auto-loaded rules, constraints, conventions, commands |
| [ROADMAP.md](ROADMAP.md) | Phases, gates, task checklists, status |
| [DECISIONS.md](DECISIONS.md) | Decision log (ADR-lite) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data flow diagram, data model, pipeline steps |
| [SETUP.md](SETUP.md) | One-time account/key setup and where each secret goes |
| [specs/features.md](specs/features.md) | Digest, saves/status, reminders, learning, commands, dashboard, multi-user |
| [specs/sources.md](specs/sources.md) | Each source: endpoint, method, robots.txt, fields, quirks |
| [research/README.md](research/README.md) | Index of research notes |
| [sessions/README.md](sessions/README.md) | Index of session logs |

**Newest research (2026-10-14):** [Unstop API](research/2026-10-14-unstop-api.md) · [Devpost API](research/2026-10-14-devpost-api.md) · [sources & robots.txt](research/2026-10-14-sources-and-robots.md) ·
[free AI tiers](research/2026-10-14-free-ai-tiers.md) · [search APIs](research/2026-10-14-search-apis.md) ·
[WhatsApp options](research/2026-10-14-whatsapp-options.md) · [Agent Reach](research/2026-10-14-agent-reach.md) ·
[GitHub cron behaviour](research/2026-10-14-github-cron.md) · [hosting & DB](research/2026-10-14-hosting-and-db.md)

**Newest research (2026-10-15):** [first live digest](research/2026-10-15-first-live-digest.md) · [Luma](research/2026-10-15-luma.md) · [Phase 2 sources](research/2026-10-15-phase2-sources.md)

**Newest sessions:** [2026-10-15 Phase 1 live](sessions/2026-10-15-phase1-live.md) · [2026-10-14 Phase 0 setup](sessions/2026-10-14-phase0-setup.md) · [2026-10-14 docs bootstrap](sessions/2026-10-14-docs-bootstrap.md)

**Original planning docs (repo root, kept for reference):** `HackRadar — Project Plan.md`, `HACKRADAR_MASTER_PROMPT.md`.

## 8. Glossary

| Term | Meaning |
|---|---|
| **Source** | A hackathon platform module (`pipeline/sources/*.py`) implementing the `Source` interface. |
| **Discovery** | Finding hackathon posts on LinkedIn/X via search APIs (Tavily/Exa/Serper) + Jina Reader, no logins. |
| **Event** | One canonical hackathon row in `events`, possibly seen on several sources. |
| **Event source** | One listing of an event on one platform (`event_sources`); keeps URL and raw JSON. |
| **Content hash** | Hash of a source listing's relevant fields; a change triggers re-summarize and reminder recompute. |
| **Digest** | The per-user daily message: top matches, closing soon, AI picks, other options, "because you saved". |
| **Score** | Per-user 0–100 fit for an event (AI score blended with save/dismiss similarity, after rule filters). |
| **Offsets** | Days before a key date when a reminder fires (default 7, 3, 1, plus same-day morning). |
| **Key date** | reg_deadline, start_date, submission_deadline (which one depends on the user's status). |
| **Status** | User's state for an event: saved → registered → submitted → done, or dismissed. |
| **Gate** | The pass condition that ends a phase; the next phase starts only after it passes. |
| **Keepalive** | Daily commit that prevents GitHub from disabling the cron on an inactive public repo. |
| **Run** | One execution of the daily pipeline, logged in the `runs` table. |
| **Deferred response** | Discord interaction reply type 5 ("thinking…") sent within 3 s; real answer follows up later. |
