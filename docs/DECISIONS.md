# HackRadar — Decision log (ADR-lite)

Append-only. Never delete entries; mark replaced ones `superseded by D-xxx`.
Format: date · decision · why · alternatives rejected · status.

---

### D-001 · ₹0 running cost, free tiers only
- **Date:** 2026-10-14 (planning)
- **Decision:** Every service must have a free tier with no credit card.
- **Why:** Personal/student project that must run indefinitely without cost or billing risk.
- **Alternatives:** Paid APIs (cheap but needs card, ongoing cost) — rejected.
- **Status:** superseded by D-044 (2026-10-16): design for real scale, run on free tiers until traffic forces upgrades.

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

### D-036 · Daily AI enrichment: summary + kind, stored per event
- **Date:** 2026-10-15
- **Decision:** After fetching, `pipeline/enrich.py` asks the AI for a 1-2 sentence `summary` and a `kind`
  (hackathon | contest | other) for open events that have none (new, or changed → reset to NULL). Max 60 events per
  run (`ai.max_events_per_run`), 12 per call, 30 s pause between calls. Saved after every batch; a dropped Neon
  connection is replaced. Never fatal: no key or AI error → events stay un-enriched, error recorded, digest still sends.
  Summaries mentioning money/dates are discarded (dates/prizes come from the source only). Migration 0003.
- **Why:** ~half of Unstop's "hackathons" feed are contests/other (research/2026-10-15-first-live-digest.md); the
  digest needs a kind filter and summaries. Debjit: work on what is actually needed (2026-10-15).
- **Alternatives:** classify by title keywords (131/261 would match a loose list; brittle); fetch Devpost pages for
  descriptions (extra requests, later).
- **Status:** active. Digest does not use `kind`/`summary` yet.

### D-035 · Groq as the default batch AI provider (amends D-006)
- **Date:** 2026-10-15
- **Decision:** `ai.batch_provider: groq` (model `openai/gpt-oss-120b`; llama-3.3-70b is not available on the account, verified 2026-10-15) for summaries, scores and extraction.
  Gemini stays an optional second adapter (not built). No embeddings from Groq → TF-IDF fallback for similarity.
- **Why:** Debjit prefers Groq (2026-10-15); one key instead of two; provider switch is one config value.
- **Alternatives:** Gemini as planned (generous free tier, but also needed Google account steps).
- **Status:** active; free limits and no-card signup **unverified** (research/2026-10-15-groq.md)

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

### D-034 · Place filter: home city + radius + metro areas
- **Date:** 2026-10-15
- **Decision:** Place preferences = format (online / in person / both), home city + travel radius (default Pune,
  150 km), and extra cities. All events page gets a Place filter (format segment, near + radius, city chips with
  counts). City strings are normalised to metro areas (e.g. Delhi NCR) and geocoded once per distinct city.
- **Why:** Debjit asked for a place filter (2026-10-15). Source city strings are inconsistent (research note).
- **Alternatives:** exact city match only (misses "West Delhi", "Bangalore Urban").
- **Status:** active (design done; build with preferences in Phase 2; geocoder to be researched first)

### D-033 · Luma via public calendar ICS feeds only
- **Date:** 2026-10-15
- **Decision:** Add Luma as a source using the iCal feeds of a curated list of hackathon-running Luma calendars
  (`api.lu.ma/ics/get?entity=calendar&id=…`), keyword-filtered to hackathons/buildathons with future dates.
  Shown as "happens <date>" (no deadline/prize/fee in the feed). Do **not** use the undocumented discover API.
- **Why:** Debjit asked for Luma (2026-10-15). robots.txt allows the API host, but Luma's terms restrict access to
  "publicly supported interfaces"; calendar subscription feeds are one, the discover endpoint is not. Search needs login.
- **Alternatives:** discover API with Pune coordinates (best coverage, 3 Pune hackathons found) — rejected on terms;
  official Luma API — paid (Luma Plus); one-off events on personal calendars — left to Phase 4 search discovery.
- **Status:** active (planned, Phase 2 with Devfolio/MLH)

### D-032 · Calendar: template links + subscribed feed, no Calendar API
- **Date:** 2026-10-15
- **Decision:** (1) "Add to Google Calendar" pre-filled template link on every event in Discord, email and dashboard;
  (2) `.ics` download; (3) per-user private calendar feed of saved events (Phase 3). No Google Calendar API.
- **Why:** Debjit asked for adding events to Google Calendar from chat, website or email. Template links and ICS feeds
  are free, need no login, and work from all three channels. The feed keeps dates current when a source changes them.
- **Alternatives:** Google Calendar API inserts — rejected: per-friend OAuth plus Google app verification for
  calendar scopes, for little gain. Feed refresh lag in Google Calendar is reportedly 12–24 h (**unverified**);
  reminders on Discord/email cover same-day changes.
- **Status:** active (planned, Phase 3)

### D-031 · Event trust signals (rules on source data, no new service)
- **Date:** 2026-10-15
- **Decision:** "Is this event real/safe?" is answered by deterministic rules on fields the platforms already
  publish, shown on each digest line: organiser ("by X"), 👥 registration count, and a flag line for
  💰 entry fee (Unstop `isPaid` + `payment_services[].amount`), 🔒 invite-only, ⚠️ no organiser listed,
  ⚠️ inconsistent dates (end < start, or registration closes after the end). A header subtext says data is copied
  from the platform listing. Flags inform; nothing is hidden. New columns: `events.entry_fee` (hashed),
  `event_sources.registrations` (refreshed every run, not hashed). Migration `0002_trust_fields.sql`.
  Phase 2 adds: "listed on 2+ platforms" confirmation (with dedupe). Phase 4 adds: web-discovered events marked
  ⚠️ unverified until they match a platform listing or official domain, plus a link-alive check for them.
- **Why:** Debjit wants events verified (2026-10-15). ~22% of open Unstop listings (58/262) charge a fee — the
  main thing to warn about. Platform API presence already proves the listing exists, so no per-event HTTP check
  for platform events (would add ~300 requests/day). AI never judges legitimacy (dates/prizes rule, CLAUDE.md).
- **Alternatives:** Supabase (suggested by Debjit for "verification") — rejected: it is a database/auth host and
  cannot verify events; we already have Postgres on Neon, and a second DB adds sync work. Hiding paid events —
  rejected; some are legit college fests, the user decides.
- **Status:** active

### D-030 · Phase 1 digest format
- **Date:** 2026-10-14
- **Decision:** One Discord webhook message per run: header (IST date, open count) + up to two embeds:
  **⏰ Closing within 3 days** and **🆕 New** (first seen after the end of the last run that sent a digest — amended 2026-10-15, was "since the previous
  successful run started", see research/2026-10-15-first-live-digest.md — excluding ones already in
  "closing"). Each sorted by the joining deadline `COALESCE(reg_deadline, submission_deadline, end_date)`, max 10
  items (`digest.list_limit`), then "…and N more". Line: linked title, deadline label ("reg closes" / "submit by" /
  "ends", time shown only when the source gives one), location, prize, source. Plain "nothing new" message when both
  are empty. Titles escaped for Markdown, capped at 120 chars; `allowed_mentions` empty.
- **Why:** Phase 1 has no preferences or AI, so deadline order is the most useful ranking. The total across embeds is
  capped at ~5,600 chars because Discord rejects messages over 6,000 (caught by a unit test).
- **Alternatives:** one message per event (spammy, rate limits); plain-text content (2,000-char limit).
- **Status:** active (replaced by per-user ranked digest in Phase 2)

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

### D-037 · Cross-platform dedupe: conservative rule-based merge
- **Date:** 2026-10-15
- **Decision:** After each fetch, `pipeline/dedupe.py` merges open events listed on *different* sources into the oldest event row, keeping every `event_sources` URL. A match needs distinctive-title overlap ≥ 0.8 (stop words and years removed) plus a second signal: a shared organiser word, or dates within 3 days when the titles are near-identical. Digest shows "✅ listed on devpost + unstop".
- **Why:** Live data showed identical generic titles within one source ("Hackathon", "Robo Race") that are different events, and the same event with different organiser strings and deadlines across platforms. A wrong merge hides a real event; a missed one only shows it twice, so the rule errs towards missing. Dry run on 311 open events found exactly the 2 known duplicates (Multimodal AI; CodeSprint / Codesprint 2026), after tightening a date signal that falsely matched 2 other pairs.
- **Alternatives:** pg_trgm similarity in SQL (scores 1.0 on generic same-source titles); AI judging pairs (costs calls, risks personal/odd merges); embeddings (Phase 4).
- **Known limits:** the surviving row keeps the oldest source's dates; a later "changed" listing from either source overwrites the row's dates (the merged sources share one event id). Different deadlines per platform are only in each source's `raw_json`. Revisit when a third source lands.
- **Status:** active

### D-038 · Place filter built on a hand-kept city table (no geocoder); owner preferences in settings.yaml
- **Date:** 2026-10-15
- **Decision:** `pipeline/place.py` + `config/places.yaml` (24 metros/cities, approximate coordinates, alias lists). A source city string resolves by exact alias, then comma-separated parts from the end; distance is haversine. In-person (offline/hybrid) events farther than `digest.radius_km` of `digest.home_city` are hidden; online and unknown-format events always show; an unknown city counts as "not near" and is logged ("unknown places") so the table can grow. The digest header says how many were hidden. Owner preferences (home Pune, 150 km, contests hidden) live in `config/settings.yaml` until the `users`/`preferences` tables are wired in Phase 3. Refines D-034 (geocoder research no longer needed for now).
- **Why:** The real data has 86 distinct city strings including venue names and junk; ~25 aliases cover the cases that matter for Pune ± 150 km, with no external service, no card, and deterministic tests. "Kalyanpur" (17 events) is a UP locality, so it is deliberately not aliased to Kalyan.
- **Alternatives:** OSM Nominatim (needs policy research, cache, network at runtime); GeoNames file (download server forbids bots; manual one-off).
- **Known limits:** coordinates are from memory, accurate to a few km, unverified against a geocoder; hybrid events far away are hidden even though they may allow remote joining; friends with other home cities need those cities in the table.
- **Status:** active

### D-039 · Web platform architecture (Vite + React site, one Vercel function)
- **Date:** 2026-10-15
- **Decision:** Site in `web/` (Vite + React). One Vercel function `web/api/index.ts` with an internal router. Neon Postgres via node-postgres. Sign-in by emailed confirm link (confirm step before the session is created) or Discord OAuth. Sessions are signed cookies. Contact details are AES-GCM encrypted, with a blind index for email lookup. Email is read-only in settings when it is the sign-in identity. Accounts are not merged across Discord and email in v1. Owner analytics at `/admin` come from our own tables (users, sign-ins). Vercel Web Analytics is not used (free limits unverified).
- **Why:** One function keeps the free-tier function count low and shares DB/session code; signed cookies need no session table; encryption plus blind index protects contact data (D-024) while allowing lookup; own-table analytics avoids an unverified external limit.
- **Alternatives:** Next.js (heavier than needed); one function per route; Neon Auth or a third-party auth provider; Vercel Web Analytics; merging Discord and email accounts (deferred).
- **Status:** active

### D-040 · Per-user notification channels; users paste their own Discord webhook
- **Date:** 2026-10-15
- **Decision:** Each signed-in user chooses their channels: email, a Discord webhook they paste, or WhatsApp (CallMeBot). The daily run builds and sends one message set per user. Settings has a "Send test message" button and a tutorial page for each channel. A pasted webhook must match `https://discord.com/api/webhooks/<id>/<token>` (or `discordapp.com`), is validated on save and again in the pipeline, and is stored encrypted.
- **Why:** Debjit's direction (2026-10-15). A per-person Discord bot (D-011) is not built yet, and a shared webhook can only post to one channel.
- **Alternatives:** shared community server only (no per-person delivery); Discord bot DMs (Phase 3, later).
- **Status:** active. Amends the single-target delivery note in `specs/features.md` §1.

### D-041 · Owner approves each new account
- **Date:** 2026-10-15
- **Decision:** New accounts start pending. Nothing is sent and nothing is saved until the owner approves them in `/admin`.
- **Why:** Limits abuse, email quota use, and personal data collection to people the owner knows.
- **Alternatives:** invite codes (codes spread); open sign-up (abuse risk from day one).
- **Status:** superseded by D-044 (2026-10-16). Sign-up is automatic; the `approved_at` column is unused.

### D-042 · Confirm the notification email before use
- **Date:** 2026-10-15
- **Decision:** If the email entered for notifications differs from the sign-in identity, a confirm link is sent to that address. The email channel stays off until it is clicked.
- **Why:** Stops typos and sending digests to someone else's inbox.
- **Alternatives:** use immediately (no check).
- **Status:** active.

### D-043 · Visit counts from our own page-view table
- **Date:** 2026-10-15
- **Decision:** `/admin` counts page views per page per IST day. No IP, user id or cookie is stored. Vercel Web Analytics is not used.
- **Why:** Keeps analytics on our own tables (as D-039 does for sign-ins) and avoids an unverified free-tier limit.
- **Alternatives:** Vercel Web Analytics (free limits unverified); no visit counts.
- **Status:** active.

### D-044 · Product is for real public scale (1,000 to 1M users); free tiers are a starting point, not a rule
- **Date:** 2026-10-16
- **Decision:** HackRadar is built as a public product, not a friends tool. Architecture must not assume a small group. Services still start on free tiers, but nothing is chosen that cannot be upgraded, and no hard ₹0 limit applies. Supersedes D-001. D-041 (manual owner approval) is under review: it does not scale, so replace it with automatic sign-up plus abuse limits.
- **Why:** Debjit (2026-10-16): users may reach 1,000 or 1M. Manual approval, one sequential cron send, Gmail SMTP (~500/day), CallMeBot WhatsApp and Vercel Hobby (non-commercial) all fail at that size.
- **Alternatives:** keep ₹0 as a hard limit (caps growth); set a fixed budget now (not chosen).
- **Status:** active. Follow-ups, each needs its own research note and decision before changing: queue-based parallel sending, a transactional email provider, official WhatsApp Business API, paid Vercel/Neon tiers, automatic sign-up with rate limits.

### D-045 · Public browsing; sign-in only for personal features; launch sign-in = email link + Google
- **Date:** 2026-10-16
- **Decision:** The landing page, Today list and event pages are open to everyone. Sign-in is required only for saved preferences, digests and WhatsApp or email opt-in. Launch sign-in methods: email link (built) and Google. Discord stays built but off. Phone-code sign-in is deferred (SMS costs money). LinkedIn and X posts appear inside Today and the digest, tagged with their source, found by keyword rules plus an LLM check. Personalisation covers ranking by saved preferences and per-user tone. The product board (claude.ai artifact "HackRadar Flow Board") holds the working flow.
- **Why:** Debjit (2026-10-16, board comments and answers). Public pages also help search and sharing.
- **Alternatives:** sign-in wall (rejected by Debjit); Supabase or Firebase Auth (not chosen yet: unverified free limits, extra dependency, and identities would need migrating).
- **Status:** active. Open: where Google sign-in lives (own OAuth like Discord is the proposal), the keyword rule set, GIF source and terms.
