# Save / Register / Calendar + Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users save hackathons, mark them registered, add them to Google Calendar, subscribe to a private ICS feed, and receive reminder messages 7/3/1 days + same day before key dates.

**Architecture:** New `web/server/saves.ts` + `saves-routes.ts` handle saves/status CRUD and the per-user ICS feed. A pure `calendar.ts` module builds Google Calendar template links and ICS text. `pipeline/reminders.py` runs in the daily job after the digest, checks `user_events` + `reminders_sent`, and sends via existing notify modules. Each subsystem is independently testable; the pipeline reminders depend only on schema and notify modules that already exist.

**Tech Stack:** TypeScript (web server), React + SWR (frontend), Python 3.12 (pipeline), Postgres (`user_events`, `reminders_sent`, `preferences`), existing notify modules (discord/email/whatsapp).

**Spec:** `docs/superpowers/specs/2026-10-23-hackradar-product-design.md` §6.3 (acting on a pick), §6.2 (ICS feed), D-032 (calendar), D-019 (reminder offsets).

## Global Constraints

- Dates and prizes come from source data; AI never sets them.
- IST (`Asia/Kolkata`) for all date logic; `Asia/Kolkata` in VTIMEZONE block.
- Secrets only from env vars; `CAL_FEED_SECRET` added to `.env.example` and `web/.env.example`.
- No Google Calendar API (D-032); template links and ICS only.
- Register = open organiser URL; never register on the user's behalf.
- `reminders_sent` unique key prevents double-sends even if run twice.
- Pipeline: `pipeline/reminders.py` fails independently — never fatal to the run.
- `reminder_offsets` lives in `preferences.reminder_offsets int[] DEFAULT '{7,3,1,0}'` (already in schema).
- Channels for reminders: `prefs.channels['reminders']` — an array of `'email' | 'discord' | 'whatsapp'`.
- `user_events` already has `status IN ('saved','registered','submitted','done','dismissed')`.
- Migration 0014 must be applied to Neon before the web routes go live.

## Review Focus

- **Double-save race:** two rapid POST `/api/me/events/:id` calls — second must upsert cleanly (not 500).
  Test: `saves.test.ts` — two concurrent saves return 200 and leave one row.
- **ICS feed with no saves:** `GET /api/me/calendar.ics` for a user with zero saved events — must return a valid but empty VCALENDAR (not 404/500).
  Test: `saves.test.ts` — empty-saves user returns 200 with `BEGIN:VCALENDAR`.
- **Reminder on date change:** source updates `reg_deadline` → `reminders_sent` unique key includes `date_value`, so old reminder row is a different key and a new reminder fires.
  Test: `test_reminders.py` — row with old `date_value` present; call fires new send for updated date.
- **ICS token with wrong secret:** `GET /api/me/calendar.ics?token=bad` must return 401, not expose events.
  Test: `saves.test.ts` — bad token returns 401.
- **Reminder for `dismissed` events:** dismissed events must never get reminders even if a row exists in `user_events`.
  Test: `test_reminders.py` — `status='dismissed'` row produces no send.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `pipeline/migrations/0014_user_events_won.sql` | Create | Add `won bool DEFAULT false`, `project_url text` to `user_events` |
| `pipeline/models.sql` | Modify | Same additions (idempotent schema) |
| `web/server/calendar.ts` | Create | Pure: `gcalLink(event)`, `toIcsFeed(events, calName)` |
| `web/server/saves.ts` | Create | DB: `upsertSave`, `deleteSave`, `getSave`, `listSaves`, `calToken` |
| `web/server/saves-routes.ts` | Create | Routes: CRUD `/api/me/events`, `GET /api/me/calendar.ics` |
| `web/server/router.ts` | Modify | Register `registerSavesRoutes()` |
| `web/src/lib/api.ts` | Modify | `fetchMyEvents`, `saveEvent`, `unsaveEvent`, `updateEventStatus`, `calFeedUrl` |
| `web/src/pages/EventDetail.tsx` | Modify | Enable Save/unsave + Register prompt + Add to Calendar button |
| `web/src/pages/Today.tsx` | Modify | Enable Save button on cards; fetch user's saved set |
| `web/src/pages/MyEvents.tsx` | Modify | Replace shell with real saved-events timeline |
| `pipeline/notify/discord.py` | Modify | Add gcal template link per event in digest |
| `pipeline/notify/email.py` | Modify | Add gcal template link per event in digest |
| `pipeline/notify/whatsapp.py` | Modify | Add gcal template link per event in digest |
| `pipeline/reminders.py` | Create | `send_reminders(conn, today, dry_run)` |
| `pipeline/run.py` | Modify | Call `send_reminders` after digest, inside `try/except` |
| `web/tests/saves.test.ts` | Create | API tests (DB-backed): save, unsave, status update, ICS feed, token |
| `web/tests/helpers.ts` | Modify | Add `user_events`, `reminders_sent` to `GUARDED_TABLES` |
| `tests/test_reminders.py` | Create | Unit + integration: offset math, dedup, dismissed skipped, date-change re-arm |
| `.env.example` | Modify | Add `CAL_FEED_SECRET` |
| `web/.env.example` | Modify | Add `CAL_FEED_SECRET` |

---

## Task 1: Schema migration 0014

**Files:**
- Create: `pipeline/migrations/0014_user_events_won.sql`
- Modify: `pipeline/models.sql`

**Interfaces:**
- Produces: `user_events.won bool NOT NULL DEFAULT false`, `user_events.project_url text`

- [ ] **Step 1: Write migration SQL**

```sql
-- 0014 · 2026-10-23 · Add won flag and project_url to user_events. Idempotent.
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS won         bool NOT NULL DEFAULT false;
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS project_url text;
```

Save to `pipeline/migrations/0014_user_events_won.sql`.

- [ ] **Step 2: Update `pipeline/models.sql`**

Add `won bool NOT NULL DEFAULT false` and `project_url text` to the `CREATE TABLE user_events` block (inside the same idempotent `CREATE TABLE IF NOT EXISTS`). Update the comment at the top: `-- changes for old databases in pipeline/migrations/, 0002 to 0014`.

- [ ] **Step 3: Apply migration to Neon**

```
mcp__Neon__run_sql_transaction with the two ALTER statements, project_id proud-bar-84693777
```

Verify with `SELECT column_name FROM information_schema.columns WHERE table_name='user_events'`.

- [ ] **Step 4: Update `pipeline/migrations/README.md`**

Move the new row from Pending to Applied with today's date.

- [ ] **Step 5: Commit**

```
git add pipeline/migrations/0014_user_events_won.sql pipeline/models.sql pipeline/migrations/README.md
git commit -m "feat: migration 0014 — user_events won flag and project_url"
```

---

## Task 2: Calendar helpers

**Files:**
- Create: `web/server/calendar.ts`
- Modify: `web/.env.example` (add `CAL_FEED_SECRET=`)

**Interfaces:**
- Consumes: `EventRow` / `EventDetail` types from `./events.js`
- Produces:
  - `gcalLink(e: { title: string; startDate?: string|null; endDate?: string|null; regDeadline?: string|null; city?: string|null; sources: {url: string}[] }): string`
  - `toIcsFeed(events: CalEvent[], calName: string): string` where `CalEvent = { id: number; title: string; startDate?: string|null; endDate?: string|null; regDeadline?: string|null; city?: string|null; sources: {url: string}[] }`

- [ ] **Step 1: Write failing tests**

```typescript
// web/tests/calendar.test.ts
import { gcalLink, toIcsFeed } from "../server/calendar.js";

test("gcalLink includes encoded title and dates", () => {
  const url = gcalLink({ title: "Hack Day", startDate: "2026-11-01", endDate: "2026-11-02", regDeadline: null, city: "Pune", sources: [{ url: "https://devpost.com/x" }] });
  expect(url).toMatch(/calendar\.google\.com\/calendar\/render/);
  expect(url).toMatch(/Hack\+Day/);
  expect(url).toMatch(/20261101/);
});

test("toIcsFeed returns valid VCALENDAR wrapper", () => {
  const ics = toIcsFeed([], "HackRadar");
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("END:VCALENDAR");
});

test("toIcsFeed includes VEVENT for each event", () => {
  const ics = toIcsFeed([{ id: 1, title: "Hack Day", startDate: "2026-11-01", endDate: "2026-11-02", regDeadline: null, city: null, sources: [{ url: "https://devpost.com/x" }] }], "HackRadar");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Hack Day");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

`cd web && npx vitest run tests/calendar.test.ts`

- [ ] **Step 3: Implement `web/server/calendar.ts`**

`gcalLink`: build `https://calendar.google.com/calendar/render?action=TEMPLATE&text=<title>&dates=<YYYYMMDD>/<YYYYMMDD>&details=<url>&location=<city>`. Use `startDate` as both start and end when `endDate` is absent; fall back to `regDeadline` if neither date is set. Use IST: treat stored ISO date strings as IST dates (add `+05:30` when no timezone given), format as `YYYYMMDD` (all-day event).

`toIcsFeed`: RFC 5545 VCALENDAR with `VERSION:2.0`, `PRODID:-//HackRadar//EN`, one VEVENT per event with `UID:<id>@hackradar`, `SUMMARY`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`, `URL`, `LOCATION`. Fold lines at 75 octets. Return a `string`.

- [ ] **Step 4: Run tests — expect PASS**

`cd web && npx vitest run tests/calendar.test.ts`

- [ ] **Step 5: Commit**

```
git add web/server/calendar.ts web/tests/calendar.test.ts web/.env.example
git commit -m "feat(web): calendar helper — gcalLink and ICS feed builder"
```

---

## Task 3: Saves API

**Files:**
- Create: `web/server/saves.ts`, `web/server/saves-routes.ts`
- Modify: `web/server/router.ts`, `web/tests/helpers.ts`, `.env.example`, `web/.env.example`
- Test: `web/tests/saves.test.ts`

**Interfaces:**
- Consumes: `gcalLink`, `toIcsFeed` from `./calendar.js`; `requireSession` from `./session.js`; `addRoute`, `error`, `json` from `./http.js`; `getPool` from `./db.js`
- Produces (routes):
  - `GET /api/me/events` → `{ items: SavedEvent[] }` (auth required)
  - `POST /api/me/events/:id` body `{}` → `{ status: string }` (save; 200 on double-save)
  - `PATCH /api/me/events/:id` body `{ status, won?, project_url? }` → `{ status: string }`
  - `DELETE /api/me/events/:id` → `{ ok: true }`
  - `GET /api/me/calendar.ics?token=<hex>` → `text/calendar` (public, token-gated)
  - `GET /api/me/calendar-token` → `{ token: string, url: string }` (auth required)
- Produces (types):
  ```typescript
  interface SavedEvent {
    eventId: number; title: string; status: string; won: boolean;
    projectUrl: string | null; startDate: string | null; regDeadline: string | null;
    sources: { url: string; source: string }[];
    gcalLink: string;
    createdAt: string;
  }
  ```

- [ ] **Step 1: Add `CAL_FEED_SECRET` to env examples**

`.env.example` and `web/.env.example`: add `CAL_FEED_SECRET=` with a comment: `# 32+ random bytes hex; generate with: openssl rand -hex 32`.

- [ ] **Step 2: Write failing tests**

```typescript
// web/tests/saves.test.ts
// Use helpers: createUser, signIn (existing pattern from auth.test.ts)
test("POST /api/me/events/:id saves an event", async () => { ... expect status 200, body.status === 'saved' });
test("POST /api/me/events/:id twice is idempotent", async () => { ... two calls, no 500 });
test("PATCH /api/me/events/:id updates status to registered", async () => { ... });
test("DELETE /api/me/events/:id removes the row", async () => { ... });
test("GET /api/me/events lists saved events with gcalLink", async () => { ... gcalLink is a string starting with https://calendar.google.com });
test("GET /api/me/calendar.ics with valid token returns VCALENDAR", async () => { ... status 200, body starts with BEGIN:VCALENDAR });
test("GET /api/me/calendar.ics with bad token returns 401", async () => { ... status 401 });
test("GET /api/me/calendar.ics with no saves returns empty VCALENDAR", async () => { ... BEGIN:VCALENDAR present });
```

Add `user_events` and `reminders_sent` to `GUARDED_TABLES` in `web/tests/helpers.ts`.

- [ ] **Step 3: Run tests — expect FAIL**

`cd web && npx vitest run tests/saves.test.ts --testTimeout=120000`

- [ ] **Step 4: Implement `web/server/saves.ts`**

`calToken(userId: number): string` — HMAC-SHA256 hex of `String(userId)` keyed on `process.env.CAL_FEED_SECRET`. Throw if env var missing.

`upsertSave(pool, userId, eventId)` — `INSERT INTO user_events ... ON CONFLICT (user_id, event_id) DO NOTHING`.

`updateSave(pool, userId, eventId, patch: { status?, won?, project_url? })` — `UPDATE user_events SET ... WHERE user_id=$1 AND event_id=$2 RETURNING status`.

`deleteSave(pool, userId, eventId)` — `DELETE FROM user_events WHERE user_id=$1 AND event_id=$2`.

`listSaves(pool, userId): Promise<SavedEvent[]>` — JOIN `user_events` with `events` + `event_sources`; include `gcalLink` computed in TS.

- [ ] **Step 5: Implement `web/server/saves-routes.ts`**

`registerSavesRoutes()`: wire the 5 routes listed above. Token route uses `requireSession`; ICS route verifies token with `calToken`. Return `Content-Type: text/calendar; charset=utf-8` on ICS. Status validation on PATCH: only allow `saved → registered → submitted → done` forward transitions plus `dismissed`.

- [ ] **Step 6: Register in `web/server/router.ts`**

Import and call `registerSavesRoutes()` alongside the other `register*Routes()` calls.

- [ ] **Step 7: Run tests — expect PASS**

`cd web && npx vitest run tests/saves.test.ts --testTimeout=120000`

- [ ] **Step 8: Commit**

```
git add web/server/saves.ts web/server/saves-routes.ts web/server/router.ts web/tests/saves.test.ts web/tests/helpers.ts .env.example web/.env.example
git commit -m "feat(web): saves API — save/register/status, ICS feed, calendar token"
```

---

## Task 4: Frontend — Save, Register, Calendar, MyEvents

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/pages/EventDetail.tsx`
- Modify: `web/src/pages/Today.tsx`
- Modify: `web/src/pages/MyEvents.tsx`

**Interfaces:**
- Consumes: `GET /api/me/events`, `POST /api/me/events/:id`, `PATCH /api/me/events/:id`, `DELETE /api/me/events/:id`, `GET /api/me/calendar-token`; `gcalLink` from API response
- Produces: working Save/unsave button; Register prompt; Add to Calendar button; `/my-events` list

- [ ] **Step 1: Extend `web/src/lib/api.ts`**

Add:
```typescript
export interface SavedEvent { eventId: number; title: string; status: string; won: boolean; projectUrl: string|null; startDate: string|null; regDeadline: string|null; sources: {url:string;source:string}[]; gcalLink: string; createdAt: string; }
export const fetchMyEvents = (): Promise<{items: SavedEvent[]}> => get("/api/me/events");
export const saveEvent = (id: number): Promise<{status:string}> => post(`/api/me/events/${id}`, {});
export const updateEventStatus = (id: number, patch: {status?:string; won?:boolean; project_url?:string}): Promise<{status:string}> => patch_(`/api/me/events/${id}`, patch);
export const unsaveEvent = (id: number): Promise<{ok:boolean}> => del(`/api/me/events/${id}`);
export const fetchCalToken = (): Promise<{token:string; url:string}> => get("/api/me/calendar-token");
```

Add `post`, `patch_`, `del` helpers alongside the existing `get` helper (same `fetch` pattern, set `Content-Type: application/json`, send body as JSON).

- [ ] **Step 2: Enable Save button in `EventDetail.tsx`**

Replace the disabled Save button (line ~328–349). Behaviour:
- Use `useSWR("/api/me/events", fetchMyEvents)` to get saved set (only when signed in — guard on `me`).
- `isSaved = savedEvents.some(e => e.eventId === Number(id))`.
- Clicking Save: call `saveEvent(Number(id))`, then `mutate("/api/me/events")`.
- Clicking Unsave: call `unsaveEvent(Number(id))`, then mutate.
- Show "Saved ✓" vs "Save" label. Keep disabled state when `me` is null.
- Add "Add to Google Calendar" `<a>` button (new, alongside Register buttons) using `gcalLink` from SWR event detail response — only shown when `isSaved`.

- [ ] **Step 3: Enable Save button in `Today.tsx`**

Replace disabled save-btn (line ~292–300). Same SWR pattern — fetch `/api/me/events` once, derive a `Set<number>` of saved IDs. Each card's Save button calls `saveEvent`/`unsaveEvent` and mutates. Only shown when signed in.

- [ ] **Step 4: Fill in `MyEvents.tsx`**

Replace the shell. `useSWR("/api/me/events", fetchMyEvents)`. Render as a timeline: upcoming (by startDate) then past. Each card shows: title, status badge (saved / registered / submitted / done), regDeadline, "Add to Google Calendar" link, "Register" button (opens source URL, then shows a "Did you register?" inline prompt → calls `updateEventStatus` to `registered`). Empty state: "Nothing saved yet — go find your next hack."

- [ ] **Step 5: Build check**

`cd web && npm run build` — expect clean.

- [ ] **Step 6: Commit**

```
git add web/src/lib/api.ts web/src/pages/EventDetail.tsx web/src/pages/Today.tsx web/src/pages/MyEvents.tsx
git commit -m "feat(web): save/register/calendar UI — Save button, Register prompt, MyEvents page"
```

---

## Task 5: Calendar links in digest channels

**Files:**
- Modify: `pipeline/notify/discord.py`
- Modify: `pipeline/notify/email.py`
- Modify: `pipeline/notify/whatsapp.py`

**Interfaces:**
- Consumes: `DigestItem` (already has `event_id`, `title`, `start_date`, `end_date`, `reg_deadline`, `city`, source URL) — verify exact field names before editing.
- Produces: a "Add to Google Calendar" link appended to each item in all three channels (D-032 §1).

- [ ] **Step 1: Add `gcal_link(event_fields) -> str` to a shared util**

Create `pipeline/notify/calendar.py`:
```python
def gcal_link(title: str, start_date: str | None, end_date: str | None, url: str, city: str | None = None) -> str:
```
Same logic as `web/server/calendar.ts` `gcalLink`: produce `https://calendar.google.com/calendar/render?action=TEMPLATE&...`. Dates are IST date strings (`YYYY-MM-DD`); format as `YYYYMMDD` for gcal.

- [ ] **Step 2: Write tests**

```python
# tests/test_calendar.py
from pipeline.notify.calendar import gcal_link
def test_gcal_link_includes_title_and_date():
    url = gcal_link("Hack Day", "2026-11-01", "2026-11-02", "https://devpost.com/x")
    assert "calendar.google.com" in url
    assert "Hack+Day" in url or "Hack%20Day" in url
    assert "20261101" in url
def test_gcal_link_no_dates_uses_empty():
    url = gcal_link("Hack Day", None, None, "https://devpost.com/x")
    assert "calendar.google.com" in url
```

Run: `uv run pytest tests/test_calendar.py -v` — expect PASS.

- [ ] **Step 3: Add gcal link to Discord digest**

In `pipeline/notify/discord.py`, in the function that formats each event line (find the place that builds the per-event text block), append `📅 [Add to Google Calendar](<gcal_link(...)>)` after the registration link. Keep it on its own line (Discord renders it as a button-style embed link).

- [ ] **Step 4: Add gcal link to email digest**

In `pipeline/notify/email.py`, in the HTML template for each event item, add an `<a href="<gcal_link>">Add to Google Calendar 📅</a>` button after the Register link. In the plain-text version, append `Add to Google Calendar: <url>`.

- [ ] **Step 5: Add gcal link to WhatsApp digest**

In `pipeline/notify/whatsapp.py`, append `📅 gcal: <url>` after each event's registration link (WhatsApp doesn't render markdown links, just plain URLs).

- [ ] **Step 6: Lint + test**

`uv run ruff check . && uv run black --check . && uv run pytest -q`

- [ ] **Step 7: Commit**

```
git add pipeline/notify/calendar.py pipeline/notify/discord.py pipeline/notify/email.py pipeline/notify/whatsapp.py tests/test_calendar.py
git commit -m "feat: add Google Calendar link to all digest channels (D-032)"
```

---

## Task 6: Reminders pipeline

**Files:**
- Create: `pipeline/reminders.py`
- Modify: `pipeline/run.py`
- Test: `tests/test_reminders.py`

**Interfaces:**
- Consumes: `conn` (psycopg connection), `today: date` (IST), `dry_run: bool = False`; `notify/{discord,email,whatsapp}.py` send functions (existing); `pipeline/user_digest.py` `Recipient` (has `.user_id`, `.channels`, `.reminder_offsets`)
- Produces: `send_reminders(conn, today, dry_run=False) -> dict` with keys `sent`, `skipped`, `errors`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_reminders.py
from datetime import date
from pipeline.reminders import due_dates, should_send

def test_due_dates_saved_event_reg_deadline():
    """Saved event: remind before reg_deadline only."""
    result = due_dates(status="saved", reg_deadline=date(2026,11,8), start_date=date(2026,11,15), submission_deadline=None)
    assert ("reg_deadline", date(2026,11,8)) in result

def test_due_dates_registered_event():
    """Registered event: remind before start_date and submission_deadline."""
    result = due_dates(status="registered", reg_deadline=date(2026,11,8), start_date=date(2026,11,15), submission_deadline=date(2026,11,16))
    assert ("start_date", date(2026,11,15)) in result
    assert ("submission_deadline", date(2026,11,16)) in result
    assert ("reg_deadline", date(2026,11,8)) not in result

def test_should_send_offset_hit():
    assert should_send(target=date(2026,11,8), today=date(2026,11,1), offset_days=7) is True

def test_should_send_offset_miss():
    assert should_send(target=date(2026,11,8), today=date(2026,11,2), offset_days=7) is False

def test_should_send_same_day():
    assert should_send(target=date(2026,11,8), today=date(2026,11,8), offset_days=0) is True

def test_due_dates_dismissed_returns_empty():
    result = due_dates(status="dismissed", reg_deadline=date(2026,11,8), start_date=None, submission_deadline=None)
    assert result == []
```

- [ ] **Step 2: Run tests — expect FAIL**

`uv run pytest tests/test_reminders.py -v`

- [ ] **Step 3: Implement `pipeline/reminders.py`**

```python
def due_dates(status: str, reg_deadline: date | None, start_date: date | None, submission_deadline: date | None) -> list[tuple[str, date]]:
    """Return (date_field, date) pairs for which reminders should fire, given status."""
```

- `saved`: only `reg_deadline`.
- `registered`: `start_date` and `submission_deadline` (skip None).
- `submitted` / `done` / `dismissed`: empty list.

```python
def should_send(target: date, today: date, offset_days: int) -> bool:
    return (target - today).days == offset_days
```

```python
def send_reminders(conn, today: date, dry_run: bool = False) -> dict:
```

1. Load all users with `status IN ('saved','registered')` from `user_events` JOIN `events` JOIN `preferences`.
2. For each (user, event): call `due_dates`; for each `(field, date_val)` × `offset_days` in user's `reminder_offsets` × channels in `prefs.channels['reminders']`:
   - Check `should_send(date_val, today, offset)`.
   - Check `reminders_sent` for existing row (same `user_id, event_id, date_field, date_value, offset_days, channel`).
   - If due and not sent: send via notify module; insert `reminders_sent` row (skip on `dry_run`).
3. Return `{"sent": n, "skipped": n, "errors": [str]}`.

One savepoint per user so one bad channel doesn't abort all reminders. Never fatal to the run.

- [ ] **Step 4: Run tests — expect PASS**

`uv run pytest tests/test_reminders.py -v`

- [ ] **Step 5: Wire into `pipeline/run.py`**

After the digest loop and before the health row, add:

```python
try:
    reminder_stats = send_reminders(conn, today_ist)
    log.info("reminders: %s", reminder_stats)
except Exception:
    log.exception("reminders failed — continuing")
```

Import `send_reminders` from `pipeline.reminders`. `today_ist` is already computed earlier in `run.py`.

- [ ] **Step 6: Lint + full test suite**

`uv run ruff check . && uv run black --check . && uv run pytest -q`

- [ ] **Step 7: Commit**

```
git add pipeline/reminders.py tests/test_reminders.py pipeline/run.py
git commit -m "feat: reminders pipeline — 7/3/1+0 day alerts for saved and registered events"
```

---

## Task 7: Docs + live check

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/CONTEXT.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/sessions/2026-10-23-save-register-calendar.md`

- [ ] **Step 1: Update `docs/ROADMAP.md`**

Tick Step 2 with build date and branch; note migration 0014 must be applied to Neon before merge.

- [ ] **Step 2: Append D-055 to `docs/DECISIONS.md`**

```
D-055 · Save/register/calendar implementation
- status transitions: saved → registered → submitted → done; dismissed at any point
- ICS token: HMAC-SHA256(CAL_FEED_SECRET, user_id); no extra DB column
- Register = open source URL + "Did you register?" inline prompt (no modal)
- Reminder dates: saved → reg_deadline; registered → start_date + submission_deadline
- Calendar link in all three digest channels (D-032 phase 3 delivered)
```

- [ ] **Step 3: Update `docs/CONTEXT.md`**

Move "Resume here" to Step 3 (public profile + handle).

- [ ] **Step 4: Update `docs/ARCHITECTURE.md`**

Add `saves.ts`, `calendar.ts`, `saves-routes.ts`, `reminders.py` to the repo layout.

- [ ] **Step 5: Write session log and commit docs**

```
git add docs/
git commit -m "docs: session handoff save-register-calendar 2026-10-23"
```
