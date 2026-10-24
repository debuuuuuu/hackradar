# HackRadar — CONTEXT (single source of truth)

_Last updated: 2026-10-24_

## 1. Resume here

**Where docs live:** all in `docs/`. At session start read this file, then the **newest file in
[`sessions/`](sessions/README.md)** (last session's done/problems/next steps), then only the sub-docs the task needs (index in §7).

- **Phase:** Phase 1 gate met (2026-10-22). Phase 2 (per-user AI scoring) not yet started. Phase 0 gate passed 2026-10-14.
- **State (2026-10-24):** Live and running. Site at https://hackradar-two.vercel.app. Daily cron green every day since 2026-10-16. Steps 1–4 + 3b all merged to `main`.
- **Finished (2026-10-24, merged PR #15):** Step 4 — interest graph on `/u/<handle>`: force-directed SVG via d3-force, graphData computed server-side, theme/event/user nodes. D-058. [Session log](sessions/2026-10-24-interest-graph.md).
- **Finished (2026-10-24, merged PR #14):** Step 3b — `/leaderboard` page + API, points formula (registered/submitted/won), medal cards, pinned-self strip, interest + city filters. D-057. [Session log](sessions/2026-10-24-leaderboard.md).
- **Finished (2026-10-24, merged to `main`, PR #13):** Step 3 — public profile `/u/<handle>`, handle setup in onboarding, visibility toggle, activity grid (IST), Terms page, Settings profile section. Migration 0015 (handle, terms_accepted_at, profile_public). D-056. [Session log](sessions/2026-10-23-public-profile.md).
- **Finished (2026-10-23, merged to `main`):** Step 2 — save/register/status flow, ICS calendar feed, Google Calendar links in Discord/email/WhatsApp, 7/3/1/0-day reminders pipeline. D-055. [Session log](sessions/2026-10-23-save-register-calendar.md).
- **Finished (2026-10-23, on `feat/for-you-picks`):** Step 1 — busy dates, AI scoring, picks in all digests + Today page. D-054. [Session log](sessions/2026-10-23-for-you-picks.md).
- **Finished (2026-10-18, merged to `main`):** Accounts and email launch ([session](sessions/2026-10-18-accounts-email-launch.md), D-049). Migrations 0009–0012 applied on Neon. Animated mascot favicon (PR #5). Save-button now shows an error when rejected (PR #6). Supabase env vars added to Vercel production.
- **Finished earlier (2026-10-18, PR #4):** Full web frontend "fun theme" (D-047, [design/DESIGN.md](design/DESIGN.md)); Google, Magic Link and Supabase password auth; onboarding flow; Settings with Discord webhook test and CallMeBot key; public events directory; Event Detail; Admin dashboard; animated mascot with quips; full accessibility.
- **Finished (2026-10-15–16):** Devfolio source; place filter (Pune ± 150 km; D-038); dedupe + "listed on 2+ platforms" badge (D-037); AI summaries and Contests section; first live Discord digest (2026-10-15); trust signals (D-031); batched upserts; public landing page; Google sign-in; Supabase email+password sign-in (D-045, D-046).
- **Product plan (approved 2026-10-23):** [design spec](superpowers/specs/2026-10-23-hackradar-product-design.md), plain-language page [design/hackradar-product.html](design/hackradar-product.html) (D-050 to D-052). Order: 1 "For you" picks + busy dates → 2 save/register/calendar + reminders → 3 public profile (○ ● ★ grid) → 3b leaderboard → 4 interest map → 5 LinkedIn/X discovery.
- **Resume here:** Steps 1–4 + 3b all merged to `main`. Email reminders (`send_reminder`) fixed 2026-10-24. **Next:** resolve open items (CAL_FEED_SECRET, Supabase keepalive table, Discord webhook rotation), then Step 5 — LinkedIn/X discovery (spec §6.7).
- **Open items:** `CAL_FEED_SECRET` not set on Vercel (ICS feeds broken until added); Supabase keep-alive table not created (SQL: `CREATE TABLE keepalive (id serial PRIMARY KEY); INSERT INTO keepalive DEFAULT VALUES;` + anon read RLS policy); Google sign-in keys not on Vercel (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`); Discord sign-in disabled (needs `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` on Vercel); Supabase auth record not deleted on account deletion (needs schema migration to store Supabase UUID + service role key); Discord webhook leaked in an earlier session — rotate it in Discord → channel settings.
- **Web platform:** plan [superpowers/plans/2026-10-15-web-platform.md](superpowers/plans/2026-10-15-web-platform.md), spec [superpowers/specs/2026-10-15-user-onboarding-design.md](superpowers/specs/2026-10-15-user-onboarding-design.md) (D-039), design spec [design/DESIGN.md](design/DESIGN.md) (D-047). Run tests: `cd web && npx vitest run`.
- **Watch out:** cron fires 23:17 UTC = next IST day; use IST for all "today" logic.

## 2. Project summary

HackRadar is a free, fully automated system that runs once a day. It:

- collects open hackathons from Indian and global platforms (Devpost, Unstop, Devfolio, MLH; Hack2Skill next),
- discovers hackathon announcements on LinkedIn/X through search APIs, with no logins,
- summarizes them with AI and ranks them against each user's interests,
- sends a per-user digest to Discord, email and WhatsApp,
- skips events that clash with the user's busy dates (planned, 2026-10-23),
- reminds users about saved events as key dates get close,
- learns from what each user saves and dismisses,
- builds a public hackathon profile and leaderboard for recruiters (planned, D-050, D-052).

Open to anyone (D-044); friends and college peers are the first users. It is also a portfolio piece.

**Owner:** Debjit (ETC engineering student, Pune; React, Node.js, Python, AI/LLM, blockchain).

**Hard constraints**
- Built for real scale, 1k to 1M users (D-044, supersedes D-001): start on free tiers, no hard ₹0 limit, never pick something that cannot be upgraded.
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
| 1 | MVP digest | Real digest on Discord 3 days in a row | ✅ met (runs green 2026-10-16 to 22; channel contents not re-verified) |
| 2 | AI + more sources | Digest ranked, no event listed twice | ⬜ |
| 3 | Saves + reminders | Saved event gets its 7/3/1-day reminders | 🟨 built, pending merge + Neon migration |
| — | Public profile (product plan Step 3) | `/u/<handle>` live after merge; Terms + 18+ at handle setup | ✅ built 2026-10-23 on `feat/public-profile`, pending merge |
| 4 | Discovery + smarts | `/ask` answers reliably (see D-020) | ⬜ |
| 5 | Dashboard + friends | 3 friends get their own digests and reminders | ⬜ |
| 6 | Portfolio polish | Repo public-ready, demo ready | ⬜ |

**Working end to end right now:** `daily.yml` (manual or cron) → `python -m pipeline.run` fetches Devpost, Unstop and Devfolio (robots-checked, polite), batch-upserts into `events`/`event_sources`, closes past events, writes a `runs` row and `data/last_run.json` → keepalive commit to `status` branch. Builds and sends per-user digests by email (Gmail SMTP, HTML), Discord webhook and WhatsApp (CallMeBot) to every onboarded user. CI (ruff, black, pytest, web vitest) green on `main`.

**Web platform (merged to `main`, in `web/`, live; D-039):** Vite + React site on the Vercel project `hackradar` (Root Directory `web`; GitHub pushes to `main` deploy it automatically). Events list; event detail; public landing page; email magic-link sign-in with name capture; Supabase email+password sign-in (D-046); onboarding and settings; owner-only analytics at `/admin`; animated mascot favicon. Discord sign-in built but disabled (needs `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` on Vercel). CI second job `web` (npm ci, vitest, build, tsc). Production smoke-tested 2026-10-18 (sign-in, setup, email digest, unsubscribe). Env vars: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `ADMIN_EMAILS`, `SITE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_DISCORD_INVITE_URL` (optional). Full list: `web/.env.example`.

## 4. Stack at a glance

| Layer | Choice | Fallback / notes |
|---|---|---|
| Scheduler | GitHub Actions cron `17 23 * * *` UTC (04:47 IST) + `workflow_dispatch` | Runs often 30–60 min late → digest lands ~5 AM IST |
| Keepalive | Daily commit of `last_run.json` to a `status` branch | Unverified that a non-default-branch commit counts; test in Phase 0 |
| Pipeline | Python 3.12 via `uv` (D-025), `psycopg` 3, `httpx`, `selectolax`/BeautifulSoup | Playwright only if unavoidable |
| Sources | Devpost ✅, Unstop ✅ (`/api/public/*`), Devfolio ✅ (2026-10-15), MLH | Next: Hack2Skill; later DoraHacks, HackerEarth |
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
- D-037 Cross-platform dedupe: conservative rule-based merge, "listed on 2+ platforms" badge.
- D-038 Place filter on a hand-kept city table (no geocoder); owner prefs in settings.yaml.
- D-039 Web platform: Vite + React site, one Vercel function.
- D-040 Per-user notification channels; users paste their own Discord webhook.
- D-041 Owner approves each new account (superseded by D-044: automatic sign-up).
- D-042 Confirm the notification email before use.
- D-043 Visit counts from our own page-view table.
- D-044 Built for real scale (1k–1M users); free tiers to start, nothing that cannot be upgraded.
- D-045 Public browsing; sign in only for personal features; email magic link and Google.
- D-046 Supabase Auth for email+password; our own session and database stay.
- D-047 Web "fun theme" (charcoal, coral, cream, mascot).
- D-048 Sessions can be ended server-side (`sessions_valid_after`); users can delete their account.
- D-049 One-click unsubscribe deletes the account; branded HTML emails; name captured on sign-in form.
- D-050 Public profiles by default behind a Terms + 18+ checkbox; recruiters see only participation.
- D-051 Only interest tags go to the ranking AI; users with the same tags share one request.
- D-052 Public leaderboard of people; submitted/won points need a project link.

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
- **Run health (audit 2026-10-15):** a source returning 0 listings now marks the run `partial`; events a healthy source
  stopped listing for 3+ days are closed (reopened if relisted); AI summaries that break the rules are stored as `""` (not retried);
  any enrichment failure is non-fatal. DB tests need `TEST_DATABASE_URL` (CI runs them on a pgvector service).
- **Cross-platform dedupe live (D-037):** merges only obvious duplicates; known limit: merged event keeps one set of dates.
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
| [superpowers/plans/2026-10-15-web-platform.md](superpowers/plans/2026-10-15-web-platform.md) | Web platform implementation plan |
| [superpowers/specs/2026-10-15-user-onboarding-design.md](superpowers/specs/2026-10-15-user-onboarding-design.md) | Web onboarding and sign-in design |
| [superpowers/specs/2026-10-23-hackradar-product-design.md](superpowers/specs/2026-10-23-hackradar-product-design.md) | **Product design:** what HackRadar is, picks, busy dates, profile, leaderboard, discovery, build order |
| [superpowers/plans/2026-10-23-for-you-picks.md](superpowers/plans/2026-10-23-for-you-picks.md) | Step 1 build plan: busy dates, topic shortlist, AI scores with a why line, picks in digest and Today |
| [superpowers/plans/2026-10-23-save-register-calendar.md](superpowers/plans/2026-10-23-save-register-calendar.md) | Step 2 build plan: save/register/status flow, ICS feed, Google Calendar links, reminders pipeline |
| [design/hackradar-product.html](design/hackradar-product.html) | Plain-language product explainer page (published as a private artifact) |
| [superpowers/plans/2026-10-15-product-launch.md](superpowers/plans/2026-10-15-product-launch.md) | Product launch plan (2026-10-15) |
| [specs/auth.md](specs/auth.md) | Sign-in, sessions, unsubscribe and account deletion |
| [design/DESIGN.md](design/DESIGN.md) | Fun theme design specification: tokens, components, mascot, motion, routes, and backend gaps |
| [research/README.md](research/README.md) | Index of research notes |
| [sessions/README.md](sessions/README.md) | Index of session logs |

**Newest research (2026-10-14):** [Unstop API](research/2026-10-14-unstop-api.md) · [Devpost API](research/2026-10-14-devpost-api.md) · [sources & robots.txt](research/2026-10-14-sources-and-robots.md) ·
[free AI tiers](research/2026-10-14-free-ai-tiers.md) · [search APIs](research/2026-10-14-search-apis.md) ·
[WhatsApp options](research/2026-10-14-whatsapp-options.md) · [Agent Reach](research/2026-10-14-agent-reach.md) ·
[GitHub cron behaviour](research/2026-10-14-github-cron.md) · [hosting & DB](research/2026-10-14-hosting-and-db.md)

**Newest research (2026-10-15):** [first live digest](research/2026-10-15-first-live-digest.md) · [Luma](research/2026-10-15-luma.md) · [Phase 2 sources](research/2026-10-15-phase2-sources.md)

**Newest research (2026-10-23):** [product research: competitors, DPDP, free limits](research/2026-10-23-product-research.md)

**Newest research (2026-10-16 to 18):** [Supabase Auth](research/2026-10-16-supabase-auth.md) · [Vercel deploy](research/2026-10-18-vercel-deploy.md)

**Newest sessions:** [2026-10-23 public-profile](sessions/2026-10-23-public-profile.md) · [2026-10-23 save/register/calendar](sessions/2026-10-23-save-register-calendar.md) · [2026-10-23 for-you-picks](sessions/2026-10-23-for-you-picks.md) · [2026-10-23 product plan](sessions/2026-10-23-product-plan.md) · [2026-10-18 accounts and email launch](sessions/2026-10-18-accounts-email-launch.md) · [2026-10-18 fun theme](sessions/2026-10-18-fun-theme.md) · [2026-10-15 Phase 1 live](sessions/2026-10-15-phase1-live.md) · [2026-10-14 Phase 0 setup](sessions/2026-10-14-phase0-setup.md) · [2026-10-14 docs bootstrap](sessions/2026-10-14-docs-bootstrap.md)

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
