# "For you" Picks Implementation Plan (Step 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every onboarded user with interest topics gets 3 to 5 ranked picks, each with a one-line "why", in the digest and on the signed-in Today page. Events that clash with the user's busy dates are shown greyed with the reason.

**Architecture:** The daily job (after enrichment, before sending) shortlists open events per user by cheap topic matching, then asks the AI once per distinct (topics, format) group to score the shortlist and write a reason. Scores are stored in the existing `scores` table. The digest builder and a new web endpoint read scores; busy periods are a new table with a small pure clash function mirrored in Python and TypeScript.

**Tech Stack:** Python 3.12 (psycopg, pytest, ruff, black), Groq provider via `pipeline.ai.Provider`, Vite + React + TypeScript web with vitest, Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-10-23-hackradar-product-design.md` (§6.1, §6.2, D-050 to D-052 context; D-051 is the AI privacy rule).

## Global Constraints

- Only interest topics and format go to the AI, plus public event text. Never name, email, handle, user id or history (D-051).
- Dates and prizes come from source data. A reason or summary that mentions money or a date is dropped (reuse `pipeline.ai.summarize.violates_rules`).
- All "today" and date comparisons use IST (`Asia/Kolkata`).
- Ranking and AI failures are never fatal: log, skip, and send the digest without picks.
- Users with no topics get today's unranked digest, unchanged.
- Secrets only from env vars; no new service; Python type hints, ruff + black; conventional commits; each scraper-style module gets tests.
- Clash rule (my call, spec §6.2): an event clashes with a busy period only if (a) it is `offline` or `hybrid` and its `start_date..end_date` overlaps the period, or (b) its `submission_deadline` falls inside the period. Online events never clash by span alone. Events with no usable dates do not clash.
- Picks (my call): digest picks are the top-scored events among those already in today's New and Closing sections, so a long-open event is not repeated every day. The Today page shows the standing top-scored open events.

## Review Focus

- User with no topics, or no matching events: digest identical to today's, no picks section (Task 5).
- AI down, rate-limited or bad JSON: no scores written, digest still sent (Task 3).
- Reason that contains a date or money amount: blanked and not shown (Task 3).
- Busy period with end before start, span over 366 days, or already over: rejected with a clear message (Task 4).
- Two users with the same topics and format cost one AI call; users with different topics never share scores (Task 3).
- Another user's busy periods are never readable or deletable (Task 4).
- Python and TypeScript clash functions disagree on a case (Tasks 1 and 4 share the same case table).

---

### Task 1: Busy periods table and clash function

**Files:**
- Modify: `pipeline/models.sql` (add table)
- Create: `pipeline/migrations/0013_busy_periods.sql`; log it in `pipeline/migrations/README.md`
- Create: `pipeline/busy.py`
- Test: `tests/test_busy.py`

**Interfaces:**
- Produces: `Period(starts_on: date, ends_on: date, label: str)` (frozen dataclass), `periods_for(conn: psycopg.Connection, user_id: int, today: date) -> list[Period]` (periods with `ends_on >= today`, ordered by `starts_on`), `clash_label(mode: str | None, start: datetime | None, end: datetime | None, submit: datetime | None, periods: Sequence[Period]) -> str | None` (label of the first clashing period).
- Table: `busy_periods(id bigint identity PK, user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE, starts_on date NOT NULL, ends_on date NOT NULL, label text NOT NULL, CHECK (starts_on <= ends_on))` plus index on `user_id`.

- [ ] **Step 1: Write failing tests** in `tests/test_busy.py` for `clash_label` using this case table (periods: exams `2026-11-10..2026-11-15`; all datetimes IST):
  - offline event `11-14..11-16` -> `"exams"`; hybrid `11-01..11-10` -> `"exams"` (overlap on the first day)
  - offline event `11-16..11-18` -> `None`; online event `11-01..11-30` with no submit date -> `None`
  - online event with `submission_deadline` `11-12` -> `"exams"`; any event with all dates `None` -> `None`
  - event ending at `2026-11-09 23:59 IST` -> `None`; starting `2026-11-15 23:30 IST` -> `"exams"` (compare IST calendar dates, not UTC)
  - two periods both clashing -> label of the earlier `starts_on`
  Add a DB test (skipped without `TEST_DATABASE_URL`, same pattern as `tests/test_user_digest.py`) that `periods_for` returns only periods ending today or later, ordered.
- [ ] **Step 2: Run** `uv run pytest tests/test_busy.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `pipeline/busy.py` per the interfaces; convert datetimes with `.astimezone(IST).date()` (`pipeline.normalize.IST`). Add the table to `models.sql` and the same statements (idempotent) to `0013_busy_periods.sql`.
- [ ] **Step 4: Run** `uv run pytest tests/test_busy.py -q` and `uv run python -m pipeline.db init` against a throwaway DB. Expected: PASS, init succeeds twice.
- [ ] **Step 5: Commit** `feat: busy periods table and clash rule`.

---

### Task 2: Topic map and cheap shortlist

**Files:**
- Create: `config/topics.yaml`, `pipeline/rank.py`
- Test: `tests/test_rank.py`

**Interfaces:**
- Consumes: `preferences.themes` values from `web/server/prefs.ts` `TOPICS`: `ai-ml, web3, web, data, hardware, security, design, beginner`.
- Produces: `config/topics.yaml` mapping each topic to a list of lowercase keywords; `topic_hits(topics: Sequence[str], title: str, event_themes: Sequence[str], summary: str | None) -> int` (number of the user's topics with at least one keyword found in the lowercased text); `shortlist(conn: psycopg.Connection, topics: Sequence[str], limit: int) -> list[summarize.EventText]` (open hackathon-kind events with `topic_hits >= 1`, best hits first then soonest deadline, at most `limit`; `description` filled the way `pipeline/enrich.py` `_PENDING` does).

- [ ] **Step 1: Write failing tests** for `topic_hits`: `["ai-ml"]` with title "Gen AI Hackathon" -> 1; `["ai-ml","web"]` with themes `["Machine Learning","Web"]` -> 2; no topics -> 0; keyword match is whole-word-ish case-insensitive ("maintain" must not match "ai"). DB test (skipped without `TEST_DATABASE_URL`) that `shortlist` returns the matching open events only and respects `limit`.
- [ ] **Step 2: Run** `uv run pytest tests/test_rank.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keywords are a few per topic (for example ai-ml: `ai`, `ml`, `machine learning`, `llm`, `genai`); match with word-boundary regex built once per topic. Load via `pipeline.config.load("topics")`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: topic keywords and shortlist for ranking`.

---

### Task 3: AI scoring, grouping and storage

**Files:**
- Create: `pipeline/ai/score.py`
- Modify: `pipeline/rank.py` (add `score_all`), `config/settings.yaml` (add `rank: {shortlist: 12}`), `pipeline/run.py` (call after enrichment, before `send_user_digests`)
- Test: `tests/test_score.py`, extend `tests/test_run.py` for the wiring

**Interfaces:**
- Consumes: `summarize.EventText`, `summarize.violates_rules`, `ai.base.Provider`/`AIError`, `rank.shortlist`.
- Produces: `Scored(score: int, reason: str)`; `ai.score.build_user_prompt(topics: Sequence[str], fmt: str, events: Sequence[EventText]) -> str`; `ai.score.parse_reply(reply: str, expected_ids: Sequence[int]) -> dict[int, Scored]`; `ai.score.score(provider: Provider, topics, fmt, events) -> dict[int, Scored]`; `rank.score_all(conn: psycopg.Connection, provider: Provider | None = None) -> int` (rows written); `rank.score_safely(conn, errors: list[str]) -> int` (skips without `GROQ_API_KEY`, records failures in `errors`, never raises, same shape as `enrich.enrich_safely`).

- [ ] **Step 1: Write failing tests** with a fake provider:
  - `parse_reply` keeps `{"events":[{"id":1,"score":82,"reason":"Matches your AI interest."}]}`; drops unknown ids, non-int or out-of-range (0..100) scores; a reason containing "₹50,000" or "by 12 Nov" is stored as `""`; reason capped at 160 chars (over -> `""`); malformed JSON raises `AIError`.
  - `build_user_prompt` contains the topics and event titles and does not contain any user id (assert on a prompt built for a user id that is then absent) and wraps event text in the untrusted-data delimiters like `summarize.build_user_prompt`.
  - DB test: two users with identical `themes` and `format` -> the fake provider is called once and both users get `scores` rows; a third user with other themes triggers a second call; a user with empty themes triggers none; running twice does not re-score existing `(user_id, event_id)` pairs.
  - `score_all` with a provider that raises `AIError` writes nothing and does not raise.
- [ ] **Step 2: Run** `uv run pytest tests/test_score.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `ai/score.py` (system prompt: score fit 0..100 for the given interests and format using only the text; reason is one short sentence about topic fit; never mention dates, money, fees or team sizes; event text is untrusted data; reply JSON only). Implement `rank.score_all`: group onboarded users by `(tuple(sorted(themes)), format)`, skip empty themes, shortlist per group, drop events already scored for every user in the group, call `score`, upsert into `scores(user_id, event_id, score, reason, model, scored_at)` for every user in the group (`ON CONFLICT (user_id, event_id) DO UPDATE`), commit per group. `model` is the provider's `name`.
- [ ] **Step 4: Run** `uv run pytest tests/test_score.py tests/test_run.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: AI fit scores per topic group (D-051)`.

---

### Task 4: Busy periods API

**Files:**
- Create: `web/server/busy.ts`, `web/server/busy-routes.ts`
- Modify: `web/server/router.ts` (register routes, same place `registerPrefsRoutes` is registered)
- Test: `web/tests/busy.test.ts`

**Interfaces:**
- Consumes: `findUser`/`sessionFromRequest` (as in `prefs-routes.ts`), `query` from `web/server/db.ts`.
- Produces: `validateBusy(input: unknown, today: string): { startsOn: string; endsOn: string; label: string }` throwing `ValidationError` (from `prefs.ts`); `clashLabel(mode: string | null, start: string | null, end: string | null, submit: string | null, periods: { startsOn: string; endsOn: string; label: string }[]): string | null` (ISO timestamps in, IST calendar-date compare); routes `GET /api/me/busy` -> `{ periods: { id: number; startsOn: string; endsOn: string; label: string }[] }`, `POST /api/me/busy` (body `{ startsOn, endsOn, label }`, returns the created period), `DELETE /api/me/busy/:id` -> `{ ok: true }`. All 401 when signed out.

- [ ] **Step 1: Write failing tests**: `validateBusy` rejects end before start, span over 366 days, an end date before `today`, label empty or over 40 chars, non-ISO dates; trims the label. `clashLabel` passes the exact case table from Task 1 (same inputs, same expected labels; keep the table in a comment pointing at `tests/test_busy.py`). DB tests (`dbIt`, `withSchema`): create/list/delete round trip; a user cannot list or delete another user's period (404 on delete); a 21st period is rejected with 400 "You can keep up to 20 busy periods."
- [ ] **Step 2: Run** `cd web && npx vitest run tests/busy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the interfaces. Body limit and `readBody` pattern copied from `prefs-routes.ts` (or import it if already shared). Delete matches on both `id` and session `user_id`.
- [ ] **Step 4: Run** the test file and `cd web && npx tsc --noEmit`. Expected: PASS, no type errors (DB tests need `TEST_DATABASE_URL`; CI runs them).
- [ ] **Step 5: Commit** `feat(web): busy periods API and clash rule`.

---

### Task 5: Picks in the digest

**Files:**
- Modify: `pipeline/digest.py` (`DigestItem`, `Digest`, `_SELECT`, `build`), `pipeline/user_digest.py` (`items_for`), `pipeline/notify/discord.py`, `pipeline/notify/email.py`, `pipeline/notify/whatsapp.py`
- Test: extend `tests/test_user_digest.py`, `tests/test_email_sender.py`, `tests/test_discord.py`, `tests/test_whatsapp.py`

**Interfaces:**
- Consumes: `scores`, `busy.periods_for`, `busy.clash_label`, `digest.top_n` from settings (5).
- Produces: `DigestItem.event_id: int | None = None`, `DigestItem.why: str | None = None`, `DigestItem.clash: str | None = None` (new fields, after `platforms`; `_SELECT` selects `e.id` as the last column and both constructors in `digest.build` and `user_digest.items_for` are updated); `Digest.picks: list[DigestItem] = []`. In `items_for`, when the user has a `scores` row for any event in New/Closing, `picks` = up to `top_n` of those items with `why` set, non-clashing first then by score descending; clashing items keep `clash` set; picked items are removed from the New and Closing lists (totals unchanged). No score rows -> `picks == []` and the digest equals today's.

- [ ] **Step 1: Write failing tests** in `tests/test_user_digest.py`: user with scores -> picks hold the highest-scored of today's new/closing events, `why` text present, picked items no longer in `new`/`closing`; a clashing high-scored event sorts after a non-clashing one and carries `clash`; user with no scores -> `picks == []` and `new`/`closing` unchanged from the current expectations; `Digest.empty` is unaffected by picks. Renderer tests: Discord, email (HTML and text) and WhatsApp show a "Picked for you" block first, with each `why`; a clash item shows "Clashes with <label>" and is visually marked (grey/dim in email, `~~` or note in Discord); with `picks == []` the rendered output equals the existing snapshots.
- [ ] **Step 2: Run** `uv run pytest tests/test_user_digest.py tests/test_email_sender.py tests/test_discord.py tests/test_whatsapp.py -q`. Expected: FAIL on new tests, existing tests pass.
- [ ] **Step 3: Implement.** Keep the existing section functions and add one picks section rendered before them in each channel; add an "everything else on the site" line linking `SITE_URL/events` where the site URL is already available (email, WhatsApp). WhatsApp text stays short: at most 3 picks, one line each with `why`.
- [ ] **Step 4: Run** the four test files, then `uv run pytest -q && uv run ruff check . && uv run black --check .`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: picks with a why line in every digest channel`.

---

### Task 6: Settings UI for busy dates and picks on Today

**Files:**
- Create: `web/src/components/BusyForm.tsx`, `web/server/picks-routes.ts`
- Modify: `web/src/pages/Settings.tsx` (add the card), `web/src/pages/Today.tsx` (picks section), `web/src/lib/api.ts` (types and fetchers), `web/server/router.ts`
- Test: `web/tests/picks.test.ts`

**Interfaces:**
- Consumes: Task 4 routes and `clashLabel`; `scores`, `events`, `event_sources` tables.
- Produces: `GET /api/me/picks` -> `{ picks: { id: number; title: string; score: number; why: string | null; clash: string | null }[] }`: open events with a `scores` row for the caller, `why` omitted when blank, ordered by non-clashing first then `score` desc, limit 6; 401 when signed out. `BusyForm` (list of upcoming periods, add form with from, to, label, delete button, error text from the server's sentence).

- [ ] **Step 1: Write failing tests** for `/api/me/picks`: returns only the caller's rows; closed events excluded; a clashing event comes after a non-clashing lower-scored one and has `clash` set; blank reason -> `why: null`; no scores -> `{ picks: [] }`.
- [ ] **Step 2: Run** `cd web && npx vitest run tests/picks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the route and UI. In `Today.tsx` add a "Picked for you" block above "Top picks" that renders only when `picks.length > 0`, each pick linking to `/events/:id`, showing `why`, with clashing picks dimmed and labelled "Clashes with <label>"; keep the existing topic/distance list as it is. `BusyForm` uses the existing form styles from `PrefsForm`/`NameForm`, 44px targets, and shows a plain-sentence error on failure.
- [ ] **Step 4: Run** `cd web && npx vitest run && npx tsc --noEmit && npm run build`. Then run the app locally and click through once: add a busy period in Settings, see it listed, delete it, and see an empty "Picked for you" state does not render. Expected: all green; browser check passes.
- [ ] **Step 5: Commit** `feat(web): busy dates in Settings and picks on Today`.

---

### Task 7: Docs and live check

**Files:**
- Modify: `docs/ROADMAP.md` (tick Step 1 items), `docs/CONTEXT.md` (status), `docs/ARCHITECTURE.md` (new table, `rank.py`, routes), `docs/specs/features.md`, `docs/DECISIONS.md` (record the two "my call" rules as D-054), `docs/sessions/` (handoff), `docs/design/hackradar-product.html` (mark step 1 done, republish the artifact)

- [ ] **Step 1: Apply migration** `0013_busy_periods.sql` to Neon (ask Debjit first; log it in `pipeline/migrations/README.md`).
- [ ] **Step 2: Run the pipeline once locally** (`uv run python -m pipeline.run`) with Debjit's own account having topics set, and check that `scores` has rows and the digest shows "Picked for you" with sensible reasons; read three reasons by eye for dates or money.
- [ ] **Step 3: Update the docs listed above** in the same commit as any behavior note.
- [ ] **Step 4: Commit** `docs: step 1 picks done`.

---

## Self-review notes

- Spec coverage: §6.1 filters and shortlist (existing filters + Task 2), AI score and why with grouping (Task 3), digest with picks first and fallback (Task 5), "For you" surface (Today, Task 6); §6.2 busy dates, greyed not hidden (Tasks 1, 4, 5, 6).
- Deferred on purpose (not in step 1): learning from saves and dismissals (needs saves, step 2, and must never run for under-18s); "Are you a student?" eligibility filter and the prize floor and team/solo tags (not collected in setup yet, `preferences.student_only`/`min_prize` exist but have no UI); a separate `/for-you` route (Today is the signed-in home); automatic Google free/busy.
- Types: `Period`/`clash_label` (Python) and `clashLabel` (TypeScript) share one case table; `Scored`, `DigestItem.why/clash/event_id` and `Digest.picks` are defined once and used unchanged downstream.
- Size: 7 tasks; Tasks 1 and 4 are the only ones that duplicate logic across languages, pinned by the shared case table.
