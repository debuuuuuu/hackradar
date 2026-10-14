# HackRadar — Master Prompt for Claude Code

> Paste everything below this line into Claude Code, from inside an empty project folder (or the new repo's root).

---

You are the lead engineer on **HackRadar**, my personal project. I'm Debjit, an ETC engineering student in Pune who works in React, Node.js, Python, AI/LLM integration and blockchain. This prompt holds all the context from my planning sessions. Your first job is to turn it into a living documentation system. Then we build the project phase by phase.

## THE MAIN RULE: a living documentation system

I often switch to new chats. Every new session must be able to pick up with **full context, by reading files only**. So the repo keeps its knowledge in a fixed doc structure, and **you keep it up to date without being asked**.

### Structure (create exactly this)

```
CLAUDE.md                    # Auto-loaded by Claude Code. Short: rules + pointers. Max ~120 lines.
docs/
├── CONTEXT.md               # THE MAIN DOC. Single source of truth. Everything a new session needs.
├── ROADMAP.md               # Phases, gates, task checklists, status of each task
├── DECISIONS.md             # Decision log (ADR-lite): every choice + why + alternatives rejected
├── ARCHITECTURE.md          # Components, data flow (Mermaid diagram), data model, pipeline steps
├── SETUP.md                 # One-time setup guide: every account, key, secret, where it goes
├── specs/
│   ├── features.md          # Digest, saves/status, reminders, learning, Discord commands, dashboard, multi-user
│   └── sources.md           # Each source: endpoint/URL, method, robots.txt status, fields, quirks
├── research/
│   ├── README.md            # Index of research notes with one-line summaries + dates
│   └── YYYY-MM-DD-<topic>.md  # One file per finding/investigation (free tiers, APIs, tools tested)
└── sessions/
    ├── README.md            # Index of sessions, newest first
    └── YYYY-MM-DD-<short-title>.md  # Log of each working session
```

### What each doc must contain

**`docs/CONTEXT.md`** (the main doc) has these sections, in this order:
1. **Resume here.** 5–10 lines: current phase, what was just finished, the exact next task, any blocker. A new session reads this first and can start working.
2. **Project summary.** What HackRadar is, the goals, and the hard constraints.
3. **Current status.** Phase, the gate status of each phase, and what is working end to end right now.
4. **Stack at a glance.** A table of layer, choice and fallback.
5. **Key decisions.** One line each, linking to `DECISIONS.md`.
6. **Known issues and open questions.**
7. **Doc index.** A link and one-line purpose for every other doc, including the newest research and session files.
8. **Glossary.** Project terms such as digest, offsets, source, discovery, and so on.

Keep CONTEXT.md under ~400 lines. When a section grows, move the detail into a sub-doc and leave a summary plus a link.

**`CLAUDE.md`** holds:
- This documentation protocol, condensed.
- The hard constraints and coding conventions (below).
- Common commands (run pipeline, run tests, deploy).
- The line: "Before doing anything, read `docs/CONTEXT.md`."

### The protocol (follow it every session, unprompted)

**At session start:**
1. Read `CLAUDE.md`, then `docs/CONTEXT.md`, then only the sub-docs the current task needs.
2. Tell me in 2–3 lines where we are and what you'll do next.

**During work:**
- **New finding** (API behaviour, a free-tier limit, a tool tested, a bug's root cause): create or append `docs/research/YYYY-MM-DD-<topic>.md`, and add it to `research/README.md`.
- **Decision made or changed:** append to `DECISIONS.md` with the date, the decision, why, the alternatives considered, and a status (active or superseded). Never delete old entries; mark them superseded.
- **Task finished:** tick it in `ROADMAP.md`.
- **Spec or architecture changed:** update the relevant doc in the same commit as the code.

**At session end, or when I say "wrap up", "save context" or "handoff":**
1. Write `docs/sessions/YYYY-MM-DD-<title>.md` covering: goal, what was done, files changed, decisions, findings, problems, and next steps.
2. Rewrite **"Resume here"** and **"Current status"** in CONTEXT.md.
3. Update the doc index.
4. Commit the docs with message `docs: session handoff <date>`.

**Rules for doc quality:**
- Write facts, not chat. Include dates. Mark anything you didn't verify as "unverified".
- Free-tier limits and API behaviour change often, so record the "as of" date and the source URL.
- Docs never contain secrets, API keys, or friends' personal data.
- If code and docs disagree, flag it to me and fix the docs.

## Project context (everything decided so far)

### What HackRadar is
A free, fully automated system. Once a day it:
- collects open hackathons from Indian and global platforms,
- finds hackathon announcements on LinkedIn/X through search, without any login,
- uses AI to summarize them and rank them against each user's interests,
- sends a digest to Discord, email and WhatsApp,
- reminds users about events they saved as key dates get close,
- learns from what each user saves and dismisses.

Friends and college peers can use it too, each with their own filters, saves and reminders. It is also a portfolio piece.

### Hard constraints
- **₹0 running cost.** Free tiers only, no credit card anywhere.
- **Fully automated** after a one-time setup.
- **Legal and safe sourcing.** Only public APIs and pages that robots.txt allows. **No logged-in scraping**: no cookies, no LinkedIn or X logins, no unofficial WhatsApp libraries.
- **Swappable AI provider.** Gemini now, Groq as fallback, Claude later through one config value.
- **No personal data sent to AI.** Only public event text.
- Secrets live only in GitHub Secrets, Vercel env vars, and a local `.env` that is gitignored.

### Stack (decided)

| Layer | Choice | Fallback / notes |
|---|---|---|
| Scheduler | GitHub Actions cron `17 1 * * *` (≈6:47 AM IST) + `workflow_dispatch` | Runs can be 30–60 min late; public repos disable cron after 60 days of inactivity, so commit `data/last_run.json` every run |
| Pipeline | Python 3.12, `httpx`, `selectolax`/BeautifulSoup, Playwright only if unavoidable | — |
| Sources | Devpost (public JSON `devpost.com/api/hackathons?status[]=open`, 40/page, paginate), Unstop (`/api/public/*` only, which robots.txt allows; never register pages), Devfolio (robots allows all), MLH (listing moved to mlh.com domain; find the current URL) | Later: Hack2Skill, DoraHacks, HackerEarth |
| LinkedIn/X discovery | Tavily search (1,000 credits/month free) → Exa via Agent Reach (no key; test it works from GitHub Actions) → Serper (2,500 one-time) | Queries like `site:linkedin.com/posts hackathon Pune 2026`, ~10/day |
| Page reading | Jina Reader (via Agent Reach) reads public posts and pages found by search | Agent Reach login channels (X/LinkedIn/Reddit cookies) stay **off** |
| AI batch | Gemini Flash / Flash-Lite (free tier; Google may use free-tier data, so public data only), 10–15 events per call | Groq |
| AI `/ask` | Groq (fast; Discord needs a reply within 3 s) | Gemini |
| Embeddings | Gemini embedding model | TF-IDF on themes |
| Database | Neon Postgres free (0.5 GB, scales to zero, never pauses). Supabase rejected because free projects pause after 1 week idle | — |
| Bot + dashboard | Vercel Hobby (free, non-commercial): Python function at `/api/interactions` (Discord HTTP interactions) + React/Vite dashboard | — |
| Discord | Bot via interactions endpoint + REST (digest with ⭐ Save / ✖ Not interested buttons) | Webhook for digest only |
| Email | Gmail SMTP + App Password (needs 2-Step Verification; 500 recipients/day) | — |
| WhatsApp | CallMeBot: each user sends a permission message once and gets an API key; text only | Meta Cloud API for a WhatsApp `/ask` bot is a later stretch goal. Twilio rejected (3-day sandbox rejoin) |

### Data model (Postgres)
- `events`: id, title, organizer, mode, city, country, reg_deadline, start_date, end_date, submission_deadline, prize_text, themes[], eligibility, team_size, invite_only, summary, embedding, first_seen_at, updated_at, status
- `event_sources`: event_id, source, source_id, url, raw_json, content_hash, last_seen_at
- `users`: id, name, discord_user_id, email, callmebot phone + key (encrypted), channels[], digest_enabled, timezone
- `preferences`: user_id, themes[], skills[], locations[], modes[], student_only, min_prize, reminder_offsets (default 7,3,1)
- `user_events`: user_id, event_id, status (saved / registered / submitted / done / dismissed), snoozed_until
- `scores`: user_id, event_id, score 0–100, reason, model, scored_at
- `reminders_sent`: user_id, event_id, date_field, offset_days, channel, sent_at
- `runs`: per-run health (source counts, errors, AI calls, notifications sent, status)

### Daily pipeline
1. **Fetch** all sources, plus discovery.
2. **Normalize** to the common event shape, with dates in IST.
3. **Extract** event details from discovered posts: Jina Reader fetches the page, then the AI extracts. Drop posts with no registration link.
4. **Deduplicate**: fuzzy title + organizer + overlapping dates merge into one event, keeping every source URL.
5. **Detect changes** with a content hash. Only new or changed events go to the AI. Past events are marked closed.
6. **Summarize** with Gemini in batches, then create embeddings.
7. **Score per user.** Rule filters first: location, mode, eligibility, invite_only. Then blend the AI score with similarity to the user's saves and away from their dismissals.
8. **Reminders**:
    - offsets come from the user's settings, default 7 / 3 / 1 days before plus a same-day morning alert
    - which date gets reminded depends on status: Saved → registration deadline; Registered → start and submission deadline
    - skip anything already in `reminders_sent`
9. **Digest per user**:
    - top 5 fits
    - closing within 3 days
    - 2–3 AI picks with reasons
    - "Other options" in compact form
    - "Because you saved X" lines
10. **Send** through each user's chosen channels.
11. **Health**:
    - write a `runs` row
    - alert on Discord if a source returns 0 results 2 days in a row, or if the run fails
    - commit the keepalive file

**Rule:** dates and prizes always come from source data, never from the AI. The AI only writes summaries, scores and extraction from discovered posts, and the link is always shown.

### Features
- **Saves and status**:
    - status flow: Saved → Registered → Submitted → Done, plus Dismissed
    - can be changed from Discord buttons, `/save`, `/status`, the dashboard, or email links
- **Reminders**:
    - include Mark registered and Snooze 1 day buttons
    - offsets can be changed per user (`/reminders 7,3,1`)
- **Discord commands**:
    - `/ask`, `/saved`, `/filters show|add|remove`, `/reminders`, `/digest now`, `/pause`, `/resume`, `/join`
    - all must reply in under 3 s
- **Dashboard** (React, with Discord OAuth login), pages:
    - All events (search and filters)
    - Saved
    - Deadline calendar
    - Settings (filters, channels, reminder days, CallMeBot key)
    - Admin health
- **Multi-user**:
    - each event is summarized once; only scoring is done per user
    - personal data is encrypted at rest

### Repo layout
```
hackradar/
├── pipeline/ (sources/{base,devpost,unstop,devfolio,mlh,discovery}.py, normalize.py, dedupe.py,
│             ai/{gemini,groq,claude}.py + prompts/, ranking.py, reminders.py, digest.py,
│             notify/{discord,email,whatsapp}.py, db.py, models.sql, migrations/, run.py)
├── bot/      (Vercel Python function: /api/interactions)
├── web/      (React + Vite dashboard)
├── tests/    (fixtures = saved real responses per source + unit tests)
├── config/   (sources.yaml, settings.yaml)
├── data/last_run.json
├── docs/     (the doc system above)
└── .github/workflows/ (daily.yml, ci.yml)
```

### Roadmap (each phase ends at a gate; don't start the next phase until the gate passes)
- **Phase 0 · Setup (week 1).** Repo, docs system, accounts and keys, Neon schema, workflow skeleton. *Gate: a manual run of daily.yml passes green.*
- **Phase 1 · MVP digest (weeks 1–2).** Devpost and Unstop scrapers with fixture tests, normalize and upsert, a Discord webhook digest (sorted by deadline, no AI yet), cron and keepalive. *Gate: a real digest arrives on Discord 3 days in a row.*
- **Phase 2 · AI + more sources (week 3).** Gemini summaries and scores, Devfolio, MLH, dedupe, email. *Gate: the digest is ranked and no event is listed twice.*
- **Phase 3 · Saves + reminders (week 4).** Vercel bot, Save buttons, status, reminders, WhatsApp via CallMeBot. *Gate: a saved event gets its 7/3/1-day reminders.*
- **Phase 4 · Discovery + smarts (week 5).** Tavily/Exa + Jina Reader, embeddings, "because you saved", `/ask`. *Gate: `/ask` answers in under 3 s.*
- **Phase 5 · Dashboard + friends (weeks 6–7).** React dashboard, Discord login, per-user filters. *Gate: 3 friends get their own digests and reminders.*
- **Phase 6 · Portfolio polish (week 8).** Tests, health alerts, README, architecture diagram, demo GIF. *Gate: the repo is public and the demo is ready.*

### Risks to keep in mind
- **A site changes its format:** fixture tests plus a zero-results alert.
- **Free-tier terms change:** adapters and fallbacks.
- **AI rate limits:** batching and backoff.
- **Cron delays:** odd-minute schedule and keepalive.
- **`/ask` is too slow:** Groq plus a small context.
- **AI hallucination:** dates come from source data only.
- **Getting blocked:** robots-allowed paths only, once a day, a clear User-Agent, no logins.

### Open decisions (ask me when relevant, then log them in DECISIONS.md)
- Reminder offsets: keep 7/3/1 + same day? (current default)
- Public or private repo? Suggested: public code, all data in Neon, nothing personal committed.
- Digest time ~6:47 AM IST?
- Final project name?
- Which source comes after the core four?

## Coding conventions
- Python: type hints, `ruff` + `black`, `pytest`. Each source implements one `Source` interface and fails independently.
- Polite HTTP: a clear User-Agent, about 1 request per second per host, retries with backoff, and robots.txt respected.
- Config in YAML. Secrets only from env vars. Provide `.env.example`.
- Every scraper gets a fixture test built from a saved real response.
- Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Code and its doc updates go in the same commit.
- Before adding any new external service, check that it's free with no card, record the finding in `docs/research/`, and log the decision.

## Your first task (do this now, then stop)
1. Initialize git if needed, and create the folder structure plus every doc above. Fill them with **all** the context in this prompt, organized by doc:
    - CONTEXT.md complete, with "Resume here" pointing to Phase 0
    - DECISIONS.md with one entry for each decision already made (stack choices, Neon over Supabase, CallMeBot over Twilio, no logged-in scraping, Agent Reach no-login channels only, and so on)
    - research notes, one file per topic: sources and robots.txt, free AI tiers, search APIs, WhatsApp options, Agent Reach, GitHub cron behaviour
    - ROADMAP.md with task checklists for each phase
    - SETUP.md with step-by-step account setup
    - the first session log
2. Write `CLAUDE.md` as described.
3. Don't write application code yet.
4. Show me the tree and a 10-line summary, list the open decisions, and wait for my go-ahead to start Phase 0.
