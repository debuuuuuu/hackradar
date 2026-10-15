# HackRadar Product Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is the master plan. Each phase below becomes its own detailed plan (`docs/superpowers/plans/YYYY-MM-DD-<phase>.md`) before it is executed. Do not start a phase until the previous gate passes.

**Goal:** Take HackRadar from a private daily digest for one owner to a public product with real, signed-in users who choose how they are notified (email, Discord webhook, or WhatsApp), with an owner admin panel, at ₹0 running cost.

**Architecture:** One Python pipeline on GitHub Actions (daily scrape, AI summary, per-user send) writing to Neon Postgres. One Vite + React site and one Vercel serverless function (sign-in, settings, events, admin API). Each user's contact details are encrypted at rest with AES-256-GCM (D-024). Each channel is a separate sender that fails alone.

**Tech Stack:** Python 3.12 + uv, httpx, psycopg, cryptography (new, for AES-GCM in Python); TypeScript, Vite, React, Vercel Hobby; Neon Postgres; GitHub Actions; Gmail SMTP; Discord webhooks and OAuth2; CallMeBot (WhatsApp).

**Spec:** `docs/superpowers/specs/2026-10-15-user-onboarding-design.md` (D-039 for web architecture). Product-level decisions live in `docs/DECISIONS.md`.

## Global Constraints

- Running cost ₹0. Free tiers only. No card anywhere (D-001).
- Fully automated after setup (D-003).
- Public sources only: public APIs and robots.txt-allowed pages. No logged-in scraping, no cookies (D-002).
- No personal data sent to any AI. Only public event text (spec, constraint).
- Dates and prizes come from source data, never AI (D-014).
- Personal data encrypted at rest (D-024). Secrets only in GitHub Secrets, Vercel env vars, gitignored `.env`.
- Logs never contain a webhook URL, CallMeBot key, email address, or exception text from an HTTP client (these echo URLs and tokens).
- All "today" logic uses IST (`Asia/Kolkata`). Cron fires at 23:17 UTC = 04:47 IST, which GitHub may run up to about 2 h late. Users must be told "your morning digest", not a fixed clock time.
- Commercial use is out of scope for v1 (see Out of scope). Vercel Hobby is used on that basis.

## Review Focus

These are the inputs and conditions most likely to break a real user. Each has a test in the owning phase.

1. **Webhook URL that is not Discord** (typo, Slack URL, internal IP). Expected: rejected on save with a clear message; the pipeline never calls it. Owner: Phase 2.
2. **Same user, same day, run twice** (manual dispatch, retry after timeout). Expected: each channel sends once. Owner: Phase 2.
3. **Encryption key mismatch between Vercel and GitHub.** Expected: a loud failure in health, not silent non-delivery. Owner: Phase 1.
4. **Sign-in link opened twice, or after 15 minutes, or from another device.** Expected: clear "link used or expired" page, no account created twice. Owner: Phase 3.
5. **User with zero events matching filters.** Expected: no empty message sent; the user is told why in the site. Owner: Phase 2.

## Global Phases and Gates

### Phase 0 · Decisions and legal (before any real user)

**Files:** Modify `docs/DECISIONS.md`; Create `docs/legal/privacy.md`, `docs/legal/terms.md` (drafts, not published).

- [ ] **Task 0.1: Log product decisions.** Add D-040 per-user channels with user-pasted webhooks; D-041 sign-up gate; D-042 sign-in identity vs notification channel; D-043 Vercel Hobby non-commercial stance. Each with date, why, alternatives, status.
- [ ] **Task 0.2: Verify free-tier and legal facts, record with as-of date and URL in `docs/research/`:** Vercel Hobby terms (non-commercial), Gmail SMTP daily send limit for personal accounts, CallMeBot message and rate limits, Discord webhook rate limits, Neon free storage and compute hours. Anything not confirmed is marked **unverified**.
- [ ] **Task 0.3: DPDP Act 2023 basics for India.** Notice, consent, purpose limitation, right to erase, grievance contact, breach handling. Written as a checklist in `docs/legal/`. Mark "get a lawyer review before wide launch" as an open item; this is not legal advice.
- [ ] **Gate 0:** decisions logged; research notes exist for every external limit this plan relies on.

### Phase 1 · Production foundation

Goal: the existing branch deploys safely, with secrets, a database and monitoring in place. No new user-facing features.

- [ ] **Task 1.1: Merge `feat/web-platform` to `main`** with both CI jobs green.
- [ ] **Task 1.2: Secret scan of full git history, urgent.** The repo has been **public since 2026-10-14** (D-017). A pattern scan on 2026-10-15 (Postgres URLs, Discord webhooks, Groq/Google key shapes, private keys) found only placeholders: localhost test DB URLs, `u:p`, webhook id `1`. That is not a full scan. Run `gitleaks` on full history and record the result in `docs/research/`.
- [ ] **Task 1.3: Vercel project for `web/`** (Hobby, Root Directory `web`). Production env: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `SITE_URL`, `ADMIN_EMAILS`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SMTP_USER`, `SMTP_APP_PASSWORD`. Values generated or copied from `.env`, never echoed.
- [ ] **Task 1.4: Same `ENCRYPTION_KEY` in GitHub Secrets** for the pipeline. Add a health check that decrypts one known test blob on both sides and reports mismatch (Review Focus 3).
- [ ] **Task 1.5: Neon: one database for prod, migrations applied in order.** Decide whether the pipeline's writes and the web app use the same database. Plan default: same database, separate schema is not needed; migrations are idempotent (already so).
- [ ] **Task 1.6: Failure alert.** Pipeline and web health failures post to the owner's private webhook (`OWNER_ALERT_WEBHOOK_URL`, separate from the shared digest webhook). Alert text contains no URL or token.
- [ ] **Task 1.7: Production smoke checklist** (from the existing web plan, Task "vercel --prod"): events list, event page, both Ask links, email sign-in, Discord sign-in, onboarding save, `/admin` non-zero, `/api/admin/stats` 401 when anonymous.
- [ ] **Gate 1:** production URL serves; smoke checklist passes; owner receives a test alert from a forced failure; gate status recorded in `docs/CONTEXT.md`.

### Phase 2 · Per-user delivery (the core product)

Goal: each signed-in user receives their own digest on the channels they chose.

- [ ] **Task 2.1: Cross-language crypto test.** Encrypt in TypeScript (`web/server/crypto.ts`), save the blob as a fixture under `tests/fixtures/`, decrypt in Python with `cryptography`'s AES-GCM. Must match the `v1:<iv>:<tag>:<ciphertext>` layout. Blocks everything below.
- [ ] **Task 2.2: Migration 0007.** Add `discord_webhook_enc text` to `users`. Mirror in `models.sql`. Add `sends` table: `(user_id, ist_date, channel)` unique, `status`, `sent_at`. Reuse existing `users.channels`, `callmebot_*_enc`, `preferences.channels`; do not add a parallel schema.
- [ ] **Task 2.3: Per-user digest builder.** Reads users with `digest_enabled`, their prefs, decrypted contacts. Reuses place filter (D-034) and kind filter. Returns zero-event users as "skip, reason" (Review Focus 5). Each user's build and send is wrapped so one failure is logged and does not stop others.
- [ ] **Task 2.4: Send-once guard.** Insert into `sends` before sending; a conflict means already sent. Test: running the builder twice for the same IST date sends once (Review Focus 2).
- [ ] **Task 2.5: Discord webhook channel.** Validate `https://discord.com/api/webhooks/<digits>/<token>` (and `discordapp.com`) on save in the web API and again in the pipeline (Review Focus 1). Encrypt on save. "Send test message" button in Settings.
- [ ] **Task 2.6: WhatsApp channel (CallMeBot, D-013).** Short message: top few events and a link to the site, not the full digest. Research note first: message length and rate limits, as-of date, source URL. Unconfirmed limits are marked unverified and the sender caps messages per run until confirmed.
- [ ] **Task 2.7: Email channel (Gmail SMTP, D-012).** One message per recipient, never CC. Footer: "Manage settings / stop these emails" link to a signed unsubscribe token. Blocked until the Gmail app password is in place. Respect the daily send limit recorded in Task 0.2.
- [ ] **Task 2.8: Keep the owner digest unchanged** (shared webhook, D-030 format) so nothing regresses.
- [ ] **Task 2.9: Logging hygiene test.** A failing send's log line contains no URL, token, key, or email (Global Constraints).
- [ ] **Gate 2:** three test accounts (owner plus two friends) each receive a personal digest on each chosen channel for three consecutive mornings; no duplicates in `sends`.

### Phase 3 · Accounts, verification and settings

Goal: sign-in, onboarding and channel setup are safe and understandable to a stranger.

- [ ] **Task 3.1: Confirm the email before it becomes a channel (decided 2026-10-15).** When a user types an email in onboarding that differs from their sign-in identity, send a confirm link. Email channel stays off until confirmed (Review Focus 4 for links).
- [ ] **Task 3.2: Magic-link edge cases.** Used link, expired link, second device, rapid repeat requests: each shows a clear page and creates no duplicate account. Tests already exist for token rules; add the UI copy tests.
- [ ] **Task 3.3: Discord sign-in verified on production.** Redirect URI registered for prod domain.
- [ ] **Task 3.4: Tutorial pages** (static routes, linked from Settings beside each field):
  - Discord webhook: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Warn: anyone with this URL can post to that channel.
  - WhatsApp (CallMeBot): add the bot's number, send the message it asks for, copy the key it returns, paste into Settings.
  - Email: nothing to set up; explain what is sent and how to stop it.
- [ ] **Task 3.5: Settings copy and empty states** per the spec's onboarding copy rules.
- [ ] **Task 3.6: Account deletion.** A "Delete my account" action removes the user row (cascades) and their encrypted contacts. Test: after delete, no row in any user-keyed table. Needed for DPDP right to erase (Task 0.3).
- [ ] **Gate 3:** a stranger, given only the site, signs in, sets one channel, and receives a digest, with no help from the owner (checked with one non-technical friend).

### Phase 4 · Sign-up gate and abuse protection

Goal: strangers cannot flood the database or the sending quota.

- [ ] **Task 4.1: Sign-up gate: owner approves each new account in `/admin` (decided 2026-10-15, D-041).** New accounts start as pending; no digests or saves until approved.
- [ ] **Task 4.2: Rate limits** on magic-link requests (already 60 s per address; add per-IP cap) and on settings writes.
- [ ] **Task 4.3: Send-quota guard.** Pipeline stops email sends when the day's count nears the Gmail limit from Task 0.2, and reports the skipped count in the owner alert.
- [ ] **Gate 4:** a scripted burst of 100 sign-in requests produces at most the configured number of emails.

### Phase 5 · Admin panel and traffic

Goal: the owner sees health, sign-ups and reach at a glance.

- [ ] **Task 5.1: Existing `/admin` stats** (users, sign-ins 7 days, onboarded %, sign-ins per day split by method, sign-ups per day, channel adoption, last pipeline run) verified on production.
- [ ] **Task 5.2: Add per-channel delivery stats** from the `sends` table: sent, failed, skipped per day and per channel. Counts only.
- [ ] **Task 5.3: Add a pending-approvals list** if Task 4.1 is option B.
- [ ] **Task 5.4: Visit counts: own page-view table (decided 2026-10-15).** Store a count per page per IST day. No IP, no user id, no cookie. Vercel Web Analytics is not used. Log as a decision in DECISIONS.
- [ ] **Task 5.5: Admin data stays personal-data free.** Test that the admin API payload contains no `@`, no `email`, no `phone`, no webhook fields (already a test; extend it to new fields).
- [ ] **Gate 5:** owner can answer, from `/admin` alone: how many people signed up this week, how many got today's digest per channel, and how many visited.

### Phase 6 · Public launch

Goal: first real strangers, safely.

- [ ] **Task 6.1: Repo visibility: already public.** Nothing to do here. Gate on Task 1.2 (full scan) and keep secrets out of git, logs and docs.
- [ ] **Task 6.2: Privacy notice and terms** published on the site (from Phase 0 drafts, after review).
- [ ] **Task 6.3: Feedback channel** (a form or a Discord server link) and a grievance contact email, shown in the footer.
- [ ] **Task 6.4: Invite wave 1:** 10–20 people from the owner's college network via the gate. Watch `/admin` daily for one week.
- [ ] **Task 6.5: Known-issues page** and a changelog file in `docs/`, updated on each release.
- [ ] **Gate 6:** one week with no failed digest run, no duplicate sends, and no privacy incident; wave 1 feedback triaged.

### Phase 7 · Growth (after Gate 6, not scheduled)

- [ ] Source expansion: Hack2Skill (D-022), MLH (`sources/mlh.py`), Luma ICS feeds (D-033), discovery (Phase 4 of the old roadmap). Each source gets a fixture test and a research note.
- [ ] Interactive Discord bot (D-011) for save and reminder buttons. Own plan when started.
- [ ] Reminders (7/3/1 + same day, D-019) per saved event and channel.
- [ ] Wave 2 invites only after Gate 6 and a usage review.

## Out of Scope (v1)

- Paid plans, billing, ads, sponsorships. Vercel Hobby and free tiers forbid or do not fit commercial use (Task 0.2 confirms).
- Mobile app.
- Logged-in scraping, unofficial WhatsApp libraries, Twilio or other paid WhatsApp gateways (D-013).
- Gemini or other chatbot links beyond ChatGPT and Claude (spec).
- Calendar API integration (D-032 uses template links and an ICS feed).
- Automatic posting of user data to any AI.
- Multi-region hosting, SLAs, paid support.

## Open Decisions (must be answered before the phase named)

| # | Decision | Needed before | Options |
|---|----------|---------------|---------|
| 1 | Sign-up gate | Phase 4 | **Decided:** owner approves each account |
| 2 | Visit counting | Phase 5 | **Decided:** own page-view table |
| 3 | Confirm email before use | Phase 3 | **Decided:** yes |
| 4 | Gmail app password | Phase 2.7 (email) | **Done:** `SMTP_USER` and `SMTP_APP_PASSWORD` in `.env` and GitHub Secrets (2026-10-15) |
| 5 | Repo visibility | Phase 6 | **Resolved:** already public since 2026-10-14 (D-017). Open item: full `gitleaks` scan (Task 1.2) |
| 6 | Delivery per user | Phase 2 | **Decided:** each user picks email, a pasted Discord webhook, or WhatsApp, with a tutorial page |

## Self-Review

1. **Spec coverage:** sign-in and verification (Phase 3), per-user channels and tutorials (Phases 2 and 3), sign-up gate (Phase 4), admin and traffic (Phase 5), privacy and consent (Phases 0, 3, 6), failure alerts (Task 1.6), production deploy (Phase 1), legal (Phase 0), launch and growth (Phases 6 and 7), out of scope (listed). Covered.
2. **Step scan:** each task names a file, a behavior, or a decision. Phase-level tasks are intentionally coarse; each phase gets a detailed plan before execution.
3. **Consistency:** `sends` table and `discord_webhook_enc` are named once in Task 2.2 and reused in 2.4, 2.5, 5.2.
4. **Review Focus:** all five lines have an owning task.
5. **Proportion:** the master plan is a map. Detailed plans come per phase.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-10-15-product-launch.md`. Please review it. Open decisions 1 to 5 need your answer. Which execution approach would you prefer?

- **Subagent-driven:** a fresh subagent per task and a reviewer after each. Most thorough; more cost.
- **Native:** I run the tasks in this session, then one reviewer checks the branch at the end. Cheaper and faster.

I recommend **Native per phase**, because phases are sequential and gated, and a mistake in Phase 2 (delivery) is caught by the gate rather than by per-task review.
