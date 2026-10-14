# HackRadar — Project Plan

Oct 14, 2026 · @I am doing research on electronics department of India so recomm

## Overview

HackRadar runs once a day for free. It collects open hackathons from Indian and global platforms, ranks them against your interests with AI, and sends a digest plus reminders for events you saved.

**Goals**

- Never miss a relevant hackathon: one daily digest with the best fits first and the other options listed below them.
- Saved events get reminders before each key date, and the ranking learns from what you save.
- Ask questions in Discord, such as "any web3 hackathons in Pune this month?"
- Usable by friends and college peers, each with their own filters, saves and reminders.
- A strong portfolio piece: clean repo, README, architecture diagram, demo.

**Constraints**

- **₹0 to run.** Free tiers only, no credit card anywhere.
- **Fully automated** after a one-time setup of about 30 minutes.
- **Legal and safe sources only.** Use public APIs and pages that robots.txt allows. No logged-in scraping of LinkedIn or X.
- **AI is swappable.** Gemini now, Groq as fallback, and Claude later through one config setting.

**Out of scope for v1:** paid APIs, logged-in scraping, unofficial WhatsApp libraries, commercial use.

## Architecture

The daily job is the only thing that writes event data. Vercel handles only what people click or ask, so nothing has to stay running.

&#91;embedded content: architecture · daily job, database, serverless bot, channels\]

The job reads the sources, writes to Neon, and sends the digest to Discord, email and WhatsApp. Button clicks and `/ask` go through Vercel to the same database.

## Tech stack and free services

Every service below has a free tier with no card. Each sits behind a small adapter, so swapping a provider means changing config, not rewriting code.

| Layer | Choice | Free limit that matters | Fallback |
| --- | --- | --- | --- |
| Scheduler | GitHub Actions cron, \~6:47 AM IST | Runs can be 30–60 min late; disabled after 60 days without repo activity in public repos | Manual `workflow_dispatch` |
| Language | Python 3.12 (`httpx`, `selectolax`/BeautifulSoup, Playwright only if needed) | — | — |
| Sources | Devpost, Unstop, Devfolio, MLH (later Hack2Skill, DoraHacks) | Polite rates; robots.txt-allowed paths only | Per-source on/off flag |
| LinkedIn/X discovery | Tavily search API | 1,000 credits/month | Exa via Agent Reach, then Serper |
| AI (batch) | Gemini Flash / Flash-Lite | Per-model RPM and RPD caps; free-tier data may be used by Google | Groq |
| AI (`/ask`) | Groq | Org-level RPM/RPD caps | Gemini |
| Database | Neon Postgres | 0.5 GB/project; scales to zero after 5 min, wakes in ms | — |
| Bot + dashboard host | Vercel Hobby (Python function + React) | Non-commercial only; 3-second Discord reply limit | — |
| Discord | Bot via interactions endpoint + REST | — | Webhook for digest only |
| Email | Gmail SMTP with App Password | 500 recipients/day | — |
| WhatsApp | CallMeBot (per-user API key) | Text only, no SLA | Discord + email |
| Embeddings (similar events) | Gemini embedding model | Same free-tier caps | TF-IDF on themes (no API) |

**Agent Reach** is a free, open-source tool. HackRadar uses only its three no-login tools:

- **Exa search:** a backup to Tavily.
- **Jina Reader:** turns a public LinkedIn post or event page into clean text.
- **RSS reading:** for clubs and organizers that publish feeds.

Its cookie-based X, LinkedIn and Reddit channels stay off, because they risk account bans, need fresh cookies every few weeks, and get blocked from GitHub's datacenter IPs. Exa's no-key access is tested from GitHub Actions in Phase 4 before relying on it. [Agent Reach](https://github.com/Panniantong/Agent-Reach)

Research behind these picks: [Devpost API](https://devpost.com/api/hackathons?status[]=open&per_page=5) · [Unstop robots.txt](https://unstop.com/robots.txt) · [Devfolio robots.txt](https://devfolio.co/robots.txt) · [MLH robots.txt](https://www.mlh.com/robots.txt) · [Free search APIs 2026](https://parallel.ai/ai/articles/best-free-web-search-api) · [Gemini free tier](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026) · [Groq free tier](https://community.groq.com/t/is-there-a-free-tier-and-what-are-its-limits/790) · [Neon vs Supabase free](https://neon.com/guides/neon-vs-supabase-free-plan) · [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [GitHub cron reliability](https://github.com/petry-projects/.github-private/discussions/656) · [Gmail SMTP limits](https://serversmtp.com/limits-of-gmail-smtp-server/) · [CallMeBot](https://vec.wordpress.org/plugins/?p=266930)

## Data model

Eight Postgres tables. One canonical `events` row per hackathon, with every place it was seen tracked in `event_sources`, so deduplication never loses a link.

| Table | Purpose | Key fields |
| --- | --- | --- |
| `events` | One row per unique hackathon | id, title, organizer, mode (online/offline/hybrid), city, country, reg\_deadline, start\_date, end\_date, submission\_deadline, prize\_text, themes\[\], eligibility, team\_size, invite\_only, summary (AI), embedding, first\_seen\_at, updated\_at, status (open/closed) |
| `event_sources` | Each listing of an event on a platform | event\_id, source (devpost/unstop/…), source\_id, url, raw\_json, content\_hash, last\_seen\_at |
| `users` | You and friends | id, name, discord\_user\_id, email, callmebot\_phone + key (encrypted), channels\[\], digest\_enabled, timezone |
| `preferences` | Per-user filters and profile | user\_id, themes\[\], skills\[\], locations\[\], modes\[\], student\_only, min\_prize, reminder\_offsets (default 7,3,1) |
| `user_events` | Saves and status | user\_id, event\_id, status (saved/registered/submitted/done/dismissed), snoozed\_until, created\_at |
| `scores` | Per-user fit score per event | user\_id, event\_id, score 0–100, reason, model, scored\_at |
| `reminders_sent` | Prevents duplicate reminders | user\_id, event\_id, date\_field, offset\_days, channel, sent\_at |
| `runs` | Health log of each daily run | run\_id, started\_at, per-source counts + errors, ai\_calls, notifications\_sent, status |

Rules:

- `content_hash` change on a source → the event is re-summarized and reminders are recomputed for date changes.
- CallMeBot keys and emails are encrypted with a key stored in GitHub/Vercel secrets.
- Personal data never goes to the AI. Only public event text does.

## Daily pipeline

One GitHub Actions job runs these steps in order, in about 5–10 minutes. A failing source or AI call is logged and skipped, never fatal.

1. **Fetch.** Each source module returns raw listings:
   - Devpost public JSON, paginated at 40 per page
   - Unstop `/api/public/` search
   - Devfolio listing page
   - MLH season page
   - Tavily queries (Exa as backup) for LinkedIn/X posts (about 10 a day, e.g. `site:linkedin.com/posts hackathon Pune 2026`)
2. **Normalize.** Map each listing into the common event shape. Dates go to IST. Mode, city and prize are parsed.
3. **Extract.** For search-discovered posts, Jina Reader fetches the public page, then the AI pulls title, dates, link and themes out of the snippet. Posts with no registration link are dropped.
4. **Deduplicate.** Fuzzy title match plus same organizer plus overlapping dates merge into one `events` row; every source URL is kept.
5. **Detect changes.** New events and events whose hash changed go to the AI. Closed or past events are marked closed.
6. **Summarize.** Gemini summarizes 10–15 events per call, then creates embeddings.
7. **Score per user.** Rules (location, mode, eligibility, invite\_only) filter out events a user can't join. The AI score is blended with similarity to the user's saved events, minus similarity to dismissed ones.
8. **Reminders.** For each saved event, check each date against the user's offsets (7/3/1 days and same day). Skip what is already in `reminders_sent`, then queue reminders that match the event's status.
9. **Digest.** Per user: top 5 fits, "Other options" (rest, compact), closing soon, 2–3 AI picks with reasons, plus "Because you saved X" lines.
10. **Send.** Discord DM or channel with buttons, email (HTML), and WhatsApp (text via CallMeBot), according to each user's channels.
11. **Health.** Write a `runs` row. If a source returns 0 results 2 days in a row, or a run fails, alert you on Discord. Commit `data/last_run.json` so GitHub keeps the schedule active.

## Feature specs

Seven features. Each lists what a user sees and the rule behind it.

**1. Daily digest**

- Sections, in order:
  1. Top matches (5 maximum, each with score, 2-line summary, deadline and link)
  2. Closing within 3 days
  3. AI picks with one-line reasons
  4. Other options (title, deadline, link only)
- Discord items carry **⭐ Save** and **✖ Not interested** buttons.
- If there are no new events, a one-line "nothing new" message is sent, so you know it ran.

**2. Saves and status**

- Status path: Saved → Registered → Submitted → Done, plus Dismissed.
- Status can be changed from Discord buttons, `/save`, `/status`, the dashboard, or email links.

**3. Reminders**

- Default offsets are 7, 3 and 1 days before, plus a same-day morning alert. Each user can change them.
- Which date gets reminded depends on status: Saved → registration deadline; Registered → start and submission deadline; Submitted → result date if known.
- Reminders carry **Mark registered** and **Snooze 1 day** buttons.

**4. Learning from saves**

- Saves boost similar events by embedding similarity; dismissals push similar events down.
- The digest explains it with a line such as "Because you saved X".

**5. Discord commands** (serverless, reply within 3 s)

- `/ask <question>`: answered from the database with Groq.
- `/saved`: your saved events and their next dates.
- `/filters show|add|remove`
- `/reminders 7,3,1`
- `/digest now` (sends the latest stored digest)
- `/pause` and `/resume`

**6. Dashboard** (React on Vercel)

- Pages: All events (search, filter by theme, mode, location, deadline), Saved, Calendar of deadlines, Settings (filters, channels, reminder days, CallMeBot key), Admin health (source status, last runs).
- Login: Discord OAuth, so each friend sees only their own saves and settings.

**7. Multi-user**

- Friends join through the Discord bot (`/join`) or a dashboard login.
- Each user gets their own filters, scores, saves, reminders and channels.
- The AI summarizes each event once; only scoring is done per user, which keeps API usage low.

## Repo structure

One monorepo: the Python pipeline, the serverless bot, and the React dashboard share one database schema.

```
hackradar/
├── pipeline/                 # daily job (GitHub Actions)
│   ├── sources/              # one module per source
│   │   ├── base.py           # Source interface + polite HTTP client
│   │   ├── devpost.py  unstop.py  devfolio.py  mlh.py
│   │   └── discovery.py      # Tavily → Exa → Jina Reader (no logins)
│   ├── normalize.py  dedupe.py
│   ├── ai/                   # provider adapters: gemini.py groq.py claude.py
│   │   └── prompts/          # summarize, extract, score, ask
│   ├── ranking.py  reminders.py  digest.py
│   ├── notify/               # discord.py email.py whatsapp.py
│   ├── db.py  models.sql  migrations/
│   └── run.py                # entry point: python -m pipeline.run
├── bot/                      # Vercel Python function: /api/interactions
├── web/                      # React (Vite) dashboard → Vercel
├── tests/                    # fixtures of saved source responses + unit tests
├── config/
│   ├── sources.yaml          # on/off, rate limits, queries
│   └── settings.yaml         # AI provider, digest size, default offsets
├── data/last_run.json        # committed each run (keeps cron alive)
├── docs/                     # SETUP.md, architecture.png, demo.gif
└── .github/workflows/daily.yml  ci.yml
```

Tests run on saved copies of each source's responses, so a site change shows up as a failing test with a clear diff.

## Build phases and milestones

About 8 weeks part-time. Each phase ends at a gate, and the next phase starts only once that gate passes, so there is always a working version.

&#91;embedded content: build roadmap · 7 phases, \~8 weeks part-time, each with a done-when gate\]

Weeks are estimates for evenings and weekends. Phase 1 is the milestone that matters most: after it, the tool is already useful every day.

**Phase 0–1 tasks (start here)**

- [ ] Create repo, folder structure, `config/*.yaml`, `.env.example`
- [ ] Write `models.sql` and run it on Neon
- [ ] `sources/base.py`: polite HTTP client (User-Agent, retries, 1 req/s)
- [ ] `sources/devpost.py` with pagination + fixture test
- [ ] `sources/unstop.py` (public API only) + fixture test
- [ ] `normalize.py` → upsert into `events` and `event_sources`
- [ ] `notify/discord.py`: webhook digest, top N by deadline (AI comes in Phase 2)
- [ ] `.github/workflows/daily.yml`: cron at 01:17 UTC + manual trigger + keepalive commit
- [ ] Watch 3 daily runs; fix anything flaky

## Risks and mitigations

The biggest risk is a source silently changing its format. Fixture tests plus a zero-results alert catch it within a day.

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A site changes its HTML or API and a scraper returns nothing | High over months | Per-source fixture tests; alert after 2 empty days; other sources keep running |
| Free tier terms change (Gemini, Groq, Tavily, Neon, CallMeBot) | Medium | Adapter per provider; fallback listed for each; config switch |
| AI rate limit hit (429) | Medium | Batch 10–15 events per call; retry with backoff; only new or changed events go to AI |
| GitHub cron delayed or disabled | Medium | Odd-minute schedule; daily commit; missed-run alert; manual run button |
| Discord `/ask` exceeds 3 s | Medium | Groq + small context from DB; precomputed summaries; short answers |
| AI hallucinates dates or prizes | Medium | Dates come from source data, never AI; AI output only for summaries and scores; link always shown |
| Duplicate or missed merges | Medium | Conservative fuzzy threshold; manual "merge" admin action later |
| Friends' personal data exposure | Low | Encrypted keys; no personal data to AI; private repo or secrets-only config |
| Getting blocked by a site | Low | robots.txt-allowed paths only; once a day; identify with a clear User-Agent; no logins |

## Setup checklist and open decisions

About 30 minutes of one-time setup, all free with no card. After that, everything runs on its own.

**One-time setup**

- [ ] GitHub repo created (decide public or private, see below)
- [ ] Neon project → copy pooled `DATABASE_URL`
- [ ] Gemini API key (Google AI Studio)
- [ ] Groq API key (console.groq.com)
- [ ] Tavily API key
- [ ] Discord application + bot token, public key, app ID; bot invited to your server
- [ ] Gmail 2-Step Verification on → App Password created
- [ ] CallMeBot: send the permission message from WhatsApp → API key
- [ ] Generate an encryption key for stored secrets
- [ ] Add all keys to GitHub Secrets and Vercel environment variables
- [ ] Vercel project linked; set Discord interactions endpoint URL

**Open decisions**

- [ ] Reminder days: keep 7/3/1 + same day as default?
- [ ] Repo public (portfolio, free unlimited Actions minutes) or private (friends' data)? Suggested: public code, all data in Neon, nothing personal committed.
- [ ] Digest time: \~6:47 AM IST okay?
- [ ] Name: HackRadar or something else?
- [ ] Which extra sources first after the core four: Hack2Skill, DoraHacks, HackerEarth?
