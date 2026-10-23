# Session: save / register / calendar + reminders (Step 2)

**Date:** 2026-10-23
**Branch:** `feat/save-register-calendar`
**Plan:** `docs/superpowers/plans/2026-10-23-save-register-calendar.md`

## Goal

Build Step 2 of the product plan: users can save hackathons, mark them registered, add to Google Calendar, subscribe to a personal `.ics` feed, and get 7/3/1/0-day reminders via their chosen channels.

## Done

All 6 implementation tasks complete. All 7 subagent task reviews returned APPROVED.

### Task 1 — Schema: migration 0014
- `pipeline/migrations/0014_user_events_won.sql`: `ALTER TABLE user_events ADD COLUMN IF NOT EXISTS won bool NOT NULL DEFAULT false; ADD COLUMN IF NOT EXISTS project_url text;`
- `pipeline/models.sql` updated
- Migration applied to Neon live DB 2026-10-23
- Also fixed: `feat/for-you-picks` commits had not landed in `main` (PR #10 showed merged but commits were missing); re-merged `origin/feat/for-you-picks` → `main` (97b09ee), then rebased this branch.

### Task 2 — Calendar helpers (`web/server/calendar.ts`)
- `gcalLink(e)`: Google Calendar template URL, IST-aware (`Intl.DateTimeFormat`), pure-date strings treated as `+05:30`
- `toIcsFeed(events, calName)`: RFC 5545 VCALENDAR, 75-octet line folding, DTEND exclusive for all-day (per RFC 5545)
- 3 tests pass

### Task 3 — Saves API (`web/server/saves.ts` + `saves-routes.ts`)
- 6 routes: `GET/POST/PATCH/DELETE /api/me/events/:id`, `GET /api/me/calendar.ics?token&user`, `GET /api/me/calendar-token`
- ICS token: `HMAC-SHA256(CAL_FEED_SECRET, userId)`, URL format `?token=<hex>&user=<uid>`
- Status transitions enforced: saved→registered→submitted→done; any→dismissed
- `won`, `project_url` patchable; `listSaves` computes `gcalLink` inline
- 8 tests (7 DB, 1 plain); DB tests skip without `TEST_DATABASE_URL`
- `CAL_FEED_SECRET` added to `.env.example` and `web/.env.example`

### Task 4 — Frontend (`web/src/`)
- `web/src/lib/api.ts`: `post`, `patch_`, `del` helpers; `SavedEvent` interface; `fetchMyEvents`, `saveEvent`, `updateEventStatus`, `unsaveEvent`, `fetchCalToken`
- `EventDetail.tsx`: `SaveButton` component (SWR key `/api/me/events`); "Add to Google Calendar" link from `saved.gcalLink`; auth-gated
- `Today.tsx`: live save toggle on picks list; SWR key consistent `/api/me/events`
- `MyEvents.tsx`: full SWR-driven list, IST date with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })`, status badge, register prompt
- Fix round 1: IST date was UTC (`toISOString().slice(0,10)`); `gcalLink` prop fallback was wrong source URL

### Task 5 — Calendar links in Python digest channels
- `pipeline/notify/calendar.py`: `gcal_link(title, start_date, end_date, url, city) → str` (stdlib only, `urllib.parse`)
- Discord: gcal link appended after trust flags in `format_item`; uses existing `IST` constant
- Email: `_gcal_url()` helper; plain-text + HTML sections both updated
- WhatsApp: `_gcal_suffix()` helper; appended on items with a deadline
- 2 tests pass; `test_trust_signals` updated (format_item now returns a calendar line)
- Minor: WhatsApp suffix uses spaces not the 📅 emoji from brief — cosmetic only

### Task 6 — Reminders pipeline (`pipeline/reminders.py`)
- `due_dates(status, reg_deadline, start_date, submission_deadline)`: saved→reg_deadline only; registered→start_date+submission_deadline
- `should_send(target, today, offset_days)`: `(target - today).days == offset_days`
- `send_reminders(conn, today, dry_run)`: queries `user_events` WHERE status IN ('saved','registered'); checks `reminders_sent` before sending; inserts on success; logs and skips errors; never fatal
- Email channel: logs+skips with TODO comment (no `send_reminder` in `email.py` yet)
- WhatsApp adapted: `WhatsAppSender().send_text(phone, key, text)` (brief had wrong constructor signature)
- Wired into `pipeline/run.py` after `rank.score_safely`, wrapped in `try/except`
- 6 unit tests pass; full suite 201 passed 45 skipped

## Files changed (new or modified)

```
pipeline/migrations/0014_user_events_won.sql  (new)
pipeline/migrations/README.md                 (updated)
pipeline/models.sql                           (updated)
pipeline/notify/calendar.py                   (new)
pipeline/notify/discord.py                    (updated)
pipeline/notify/email.py                      (updated)
pipeline/notify/whatsapp.py                   (updated)
pipeline/reminders.py                         (new)
pipeline/run.py                               (updated)
tests/test_calendar.py                        (new)
tests/test_discord.py                         (updated — test_trust_signals)
tests/test_reminders.py                       (new)
web/server/calendar.ts                        (new)
web/server/saves.ts                           (new)
web/server/saves-routes.ts                    (new)
web/server/router.ts                          (updated)
web/src/lib/api.ts                            (updated)
web/src/pages/EventDetail.tsx                 (updated)
web/src/pages/Today.tsx                       (updated)
web/src/pages/MyEvents.tsx                    (updated)
web/tests/calendar.test.ts                    (new)
web/tests/saves.test.ts                       (new)
.env.example                                  (updated — CAL_FEED_SECRET)
web/.env.example                              (updated — CAL_FEED_SECRET)
```

## Commits (newest first)

```
5c80c7d  feat: reminders pipeline — 7/3/1+0 day alerts for saved and registered events
419177e  feat: add Google Calendar link to all digest channels (D-032)
757ca4b  fix(web): IST date in MyEvents, correct gcalLink in SaveButton
0b8a15c  feat(web): save/register/calendar UI — Save button, Register prompt, MyEvents page
d479933  feat(web): saves API — save/register/status, ICS feed, calendar token
8063483  feat(web): calendar helper — gcalLink and ICS feed builder
7207d0f  feat(schema): add won and project_url to user_events (migration 0014)
```

## Decisions

- **D-055** (2026-10-23): ICS token format `?token=<hmac>&user=<uid>`; `won` + `project_url` in `user_events`; email reminders log+skip pending `send_reminder`.

## Known issues / open items

- **Migration 0014** not yet applied to Neon live DB (the `won` and `project_url` columns are missing in production). Apply before merging: `uv run python -m pipeline.db init` or run the SQL directly.
- **Email reminders** log and skip — no `send_reminder` function in `pipeline/notify/email.py` yet. Add it to send real email reminders (use the existing HTML email sender pattern).
- **WhatsApp gcal suffix** is `"\n   gcal: ..."` (3 spaces) instead of `"\n📅 gcal: ..."` — cosmetic.
- **CAL_FEED_SECRET** must be set on Vercel (32+ hex bytes). Generate: `openssl rand -hex 32`.
- **Web DB tests** skip without `TEST_DATABASE_URL` — normal; CI has the pgvector service.
- **Phase 3 gate** (saved event gets 7/3/1-day reminders): needs a real saved event in production to verify end-to-end. Reminders will fire on the next daily run after a user saves an event.

## Next steps

1. Apply migration 0014 to Neon live DB.
2. Set `CAL_FEED_SECRET` on Vercel.
3. Merge this PR into `main`.
4. Watch the next daily run for reminder stats in the log.
5. Implement `email.notify.send_reminder` for email reminders.
6. Step 3: public profile (`/u/<handle>`) — see `docs/superpowers/specs/2026-10-23-hackradar-product-design.md` §6.4.
