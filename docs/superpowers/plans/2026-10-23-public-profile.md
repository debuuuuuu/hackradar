# Public Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public profile page at `/u/<handle>` showing a user's activity grid (registered ●, submitted/won ★) and counts, gated behind a Terms + 18+ checkbox that must be accepted before the handle is set.

**Architecture:** New `users` columns (`handle`, `terms_accepted_at`, `profile_public`) behind migration 0015; a new `profile-routes.ts` / `profile.ts` module serves four endpoints; a new `Profile.tsx` page and `Terms.tsx` page are wired into `App.tsx`; the onboarding flow gets a third step (handle choice) that fires after prefs are saved.

**Tech Stack:** Python 3.12 (migration), TypeScript + Hono (server), React + Vite (client), Postgres via `query`/`transaction` from `./db.js`, existing `sessionFromRequest` + `findUser` auth pattern.

**Spec:** `docs/superpowers/specs/2026-10-23-hackradar-product-design.md` §6.4

## Global Constraints

- Handle format: `/^[a-z][a-z0-9-]{2,29}$/` — 3–30 chars, starts with letter, lowercase only
- Reserved handles: `admin`, `api`, `u`, `leaderboard`, `terms`, `settings`, `events`, `signin`
- `profile_public = false` → 404 (not 403) on public fetch
- Activity ○ marks (scored, not registered) are **owner-only** — never sent to unauthenticated callers
- Terms + 18+ checkbox must be accepted **before** a handle can be set; both are atomic
- Dates and prizes come from DB, never AI; all IST bucketing uses `AT TIME ZONE 'Asia/Kolkata'`
- DB pattern: `query` / `transaction` from `./db.js`; auth: `sessionFromRequest` + `findUser` from `./auth.js`
- Fun theme colors: charcoal `#1f1e1d`, coral `#e5484d`, cream `#f3e7d7`
- No personal data (email, phone) goes to AI or appears in profile responses
- Follows existing route-registration pattern: `registerXxxRoutes()` called in `router.ts`

## Review Focus

1. **Handle uniqueness race** — two simultaneous PATCH requests with the same handle: only one should succeed; the other gets HTTP 409. The `UNIQUE` constraint on `users.handle` must be caught and returned as 409, not 500.
2. **Privacy gate** — `profile_public = false` must return 404 for unauthenticated callers and non-owners; test this with a public fetch after setting `profile_public = false`.
3. **Terms gate** — setting a handle without accepting terms must be rejected; the test inserts a user with no `terms_accepted_at` and calls PATCH, expecting 400.
4. **○ marks never leak** — the public profile endpoint returns only `registered` / `submitted` / `won` marks; ○ (skipped/scored-not-registered) must not appear in the response for any caller other than the owner.
5. **IST bucketing** — `start_date` is stored as `timestamptz`; the week-column in the activity grid must group by IST calendar week, not UTC. Use `DATE_TRUNC('week', e.start_date AT TIME ZONE 'Asia/Kolkata')`.

---

### Task 1: Schema

**Files:**
- Create: `pipeline/migrations/0015_profile.sql`
- Modify: `pipeline/models.sql` (append new columns + ALTER TABLE guards)

**Interfaces:**
- Produces: `users.handle text UNIQUE`, `users.terms_accepted_at timestamptz`, `users.profile_public boolean NOT NULL DEFAULT true`

- [ ] **Step 1: Write migration**

```sql
-- pipeline/migrations/0015_profile.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS users_handle_idx ON users (handle);
```

- [ ] **Step 2: Apply migration to Neon**

Run each statement as a separate `mcp__Neon__run_sql` call against project `proud-bar-84693777` (Neon rejects multi-statement calls).

- [ ] **Step 3: Append to `pipeline/models.sql`**

After the existing `ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_after` line, add:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS users_handle_idx ON users (handle);
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/migrations/0015_profile.sql pipeline/models.sql
git commit -m "feat: migration 0015 — handle, terms_accepted_at, profile_public on users

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Profile API

**Files:**
- Create: `web/server/profile.ts`
- Create: `web/server/profile-routes.ts`
- Modify: `web/server/router.ts` (add `registerProfileRoutes()` import + call)
- Modify: `web/server/auth.ts` (extend `PublicUser` + update `findUser` SELECT)
- Create: `web/tests/profile.test.ts`

**Interfaces:**
- Consumes: `query`, `transaction` from `./db.js`; `sessionFromRequest`, `findUser`, `PublicUser` from `./auth.js`; `addRoute`, `json` from `./http.js`
- Produces (endpoints):
  - `GET /api/profile/:handle` → `PublicProfile`
  - `GET /api/me/profile` → `OwnProfile` (auth required)
  - `PATCH /api/me/profile` → `{ ok: true }` (auth required)
  - `GET /api/profile/handle-check?q=<handle>` → `{ available: boolean }`
- Produces (types in `profile.ts`):
  ```typescript
  export interface ActivityMark {
    eventId: number;
    title: string;
    startDate: string;        // IST ISO date "YYYY-MM-DD"
    mark: "registered" | "submitted" | "won" | "skipped";
    projectUrl?: string;
  }
  export interface ProfileCounts { registered: number; submitted: number; won: number; }
  export interface PublicProfile {
    handle: string;
    name: string;
    counts: ProfileCounts;
    activity: ActivityMark[];
    isOwn: boolean;
  }
  export interface OwnProfile {
    handle: string | null;
    profilePublic: boolean;
    termsAcceptedAt: string | null;
  }
  ```
- Produces (`auth.ts`): `PublicUser` gains `handle: string | null`

**Review focus tests to include:**
- 409 on duplicate handle PATCH
- 404 on `profile_public = false` public fetch
- 400 on PATCH handle without terms accepted
- ○ marks absent from public profile response

- [ ] **Step 1: Extend `PublicUser` in `auth.ts`**

In the `PublicUser` interface, add `handle: string | null` after `isAdmin: boolean`.

In `findUser`, change the SELECT to also fetch `handle`:
```sql
SELECT id, name, onboarded_at, is_admin, sessions_valid_after AS valid_after, handle
FROM users WHERE id = $1
```
Return type row gets `handle: string | null`. Add `handle: r.handle ?? null` to the returned object.

- [ ] **Step 2: Write failing tests**

```typescript
// web/tests/profile.test.ts
// Tests (use existing test helpers — look at web/tests/ for DB/session setup patterns):
// 1. GET /api/profile/:handle 200 returns PublicProfile for public user
// 2. GET /api/profile/:handle 404 when profile_public = false
// 3. GET /api/profile/:handle 404 for nonexistent handle
// 4. GET /api/profile/handle-check?q=newhandle → { available: true }
// 5. GET /api/profile/handle-check?q=takenhandle → { available: false }
// 6. GET /api/me/profile 401 when unauthenticated
// 7. GET /api/me/profile 200 returns OwnProfile
// 8. PATCH /api/me/profile 400 when terms not accepted (no terms_accepted_at)
// 9. PATCH /api/me/profile sets handle + terms_accepted_at atomically
// 10. PATCH /api/me/profile 409 on duplicate handle
// 11. Public GET omits "skipped" marks (○) from activity
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd web && npm test -- --testPathPattern=profile
```

Expected: FAIL — profile.ts not found.

- [ ] **Step 4: Implement `profile.ts`**

```typescript
// web/server/profile.ts
export const RESERVED_HANDLES = new Set([
  "admin","api","u","leaderboard","terms","settings","events","signin"
]);
export const HANDLE_RE = /^[a-z][a-z0-9-]{2,29}$/;
```

`getPublicProfile(handle, callerUid?)`:
- SELECT user with `handle = $1` and `profile_public = true` (if caller is not the owner; if owner, skip `profile_public` check)
- JOIN `user_events` on statuses `registered`, `submitted`, `done` + `won = true` → `submitted` mark, `won = true` → `won` mark
- JOIN `events` for `title`, `start_date` (bucketed to IST ISO date)
- Counts: `registered` = rows with status in `('registered','submitted','done')`, `submitted` = rows with `status IN ('submitted','done')`, `won` = rows with `won = true`
- Activity array: each qualifying `user_events` row as `ActivityMark`; public callers get only `registered` / `submitted` / `won`; owner also gets `skipped` from `scores` rows with no matching `user_events`
- Return `PublicProfile` with `isOwn: callerUid === user.id`

`getOwnProfile(uid)`: SELECT `handle`, `terms_accepted_at`, `profile_public` from `users WHERE id = $1`. Return `OwnProfile`.

`setProfile(uid, { handle?, termsAccepted?, profilePublic? })`:
- If `handle` provided: validate format with `HANDLE_RE`; reject reserved handles → 400; require `termsAccepted === true` in same call, or `terms_accepted_at IS NOT NULL` already in DB → 400 otherwise
- Build UPDATE sets: `handle = $N` if provided, `terms_accepted_at = now()` if `termsAccepted`, `profile_public = $M` if provided
- Execute; catch Postgres unique violation (`23505`) → throw with code 409
- Return `{ ok: true }`

`checkHandle(handle)`: SELECT COUNT(*) from users where handle = $1. Return `{ available: count === 0 && HANDLE_RE.test(handle) && !RESERVED_HANDLES.has(handle) }`.

- [ ] **Step 5: Implement `profile-routes.ts`**

```typescript
// web/server/profile-routes.ts
// GET /api/profile/handle-check — must be registered BEFORE :handle route
// GET /api/profile/:handle
// GET /api/me/profile
// PATCH /api/me/profile  body: { handle?, termsAccepted?, profilePublic? }
```

Follow exact pattern of `saves-routes.ts`: import `addRoute`, `json`; import `sessionFromRequest`, `findUser`; call `getPublicProfile` etc. from `./profile.js`.

Note: `handle-check` route must be registered before `/:handle` to avoid shadowing.

- [ ] **Step 6: Register in `router.ts`**

Add import `import { registerProfileRoutes } from "./profile-routes.js";` and call `registerProfileRoutes();` after `registerSavesRoutes();`.

- [ ] **Step 7: Run tests**

```bash
cd web && npm test -- --testPathPattern=profile
```

Expected: PASS all 11.

- [ ] **Step 8: Commit**

```bash
git add web/server/profile.ts web/server/profile-routes.ts web/server/router.ts web/server/auth.ts web/tests/profile.test.ts
git commit -m "feat: profile API — public profile, handle check, own profile PATCH

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Profile Page + Terms Page

**Files:**
- Create: `web/src/pages/Profile.tsx`
- Create: `web/src/pages/Terms.tsx`
- Modify: `web/src/App.tsx` (add `/u/:handle` and `/terms` routes)

**Interfaces:**
- Consumes: `PublicProfile`, `ActivityMark`, `ProfileCounts` (types from server, re-declared or imported via a shared types file — follow existing pattern; if no shared types file exists, declare them in `Profile.tsx`)
- `GET /api/profile/:handle` → `PublicProfile`
- `GET /api/me/profile` → `OwnProfile`

- [ ] **Step 1: Implement `Terms.tsx`**

Static page: heading "Terms of Service", body text covering:
- HackRadar is a hackathon discovery tool for users 18+
- Public profile is opt-in; your name and activity are visible
- You can disable or delete your profile at any time in Settings

Include a back link / close button. No API calls. Style with fun-theme tokens (`bg-[#1f1e1d]`, text `#f3e7d7`, accent `#e5484d`).

- [ ] **Step 2: Implement `Profile.tsx`**

Fetches `GET /api/profile/:handle` using the `:handle` param.

Renders:
- Name + handle (`@handle`)
- Three count badges: `registered`, `submitted`, `won`
- Activity grid: columns = calendar weeks (IST), rows = events that week, cells show mark symbol (● registered/submitted, ★ won, ○ skipped — ○ only if `isOwn`)
- Grid range: last 52 weeks from today
- Empty state when activity is empty
- 404 state when the API returns 404
- Loading skeleton

If `isOwn`, show edit controls: toggle `profile_public` (PATCH to `api/me/profile`), and a link to Settings for handle change.

- [ ] **Step 3: Add routes in `App.tsx`**

```tsx
<Route path="/u/:handle" element={<Profile />} />
<Route path="/terms" element={<Terms />} />
```

Import both components.

- [ ] **Step 4: Run full web test suite**

```bash
cd web && npm test
```

Expected: existing tests pass; no regressions.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Profile.tsx web/src/pages/Terms.tsx web/src/App.tsx
git commit -m "feat: Profile and Terms pages, /u/:handle route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Handle Setup Flow

**Files:**
- Modify: `web/src/pages/Onboarding.tsx` (add handle step 3 after prefs)
- Modify: `web/src/components/PrefsForm.tsx` (accept `onDone?: () => void` in onboarding mode instead of hard-redirect)
- Modify: `web/src/App.tsx` (redirect signed-in users with `handle === null` to `/welcome`)
- Modify: `web/src/pages/Settings.tsx` (add Profile section: show handle, toggle profile_public, terms link)

**Interfaces:**
- Consumes: `PublicUser` now has `handle: string | null` (from Task 2)
- `GET /api/me/profile` → `OwnProfile`
- `PATCH /api/me/profile` body `{ handle, termsAccepted: true }`

- [ ] **Step 1: Update `PrefsForm.tsx`**

In onboarding mode (when the `onboarding` prop is true), instead of `window.location.assign("/")` on success, call `props.onDone?.()` if provided, else fall back to the existing redirect.

Signature change: add optional prop `onDone?: () => void`.

- [ ] **Step 2: Update `Onboarding.tsx`**

Add step 3 (handle setup) after the prefs step:

- When prefs step completes (via `onDone` from PrefsForm), advance to step 3
- Step 3 renders:
  - Input for handle (slug, 3–30 chars, `/^[a-z][a-z0-9-]{2,29}$/`)
  - Debounced availability check via `GET /api/profile/handle-check?q=<handle>`
  - Terms + 18+ checkbox (link to `/terms` opens in new tab)
  - Submit button disabled until: handle is valid + available + terms checked
  - On submit: `PATCH /api/me/profile` with `{ handle, termsAccepted: true }`
  - On success: `window.location.assign("/")`
  - Skip link: "I'll do this later" → `window.location.assign("/")`

- [ ] **Step 3: Add redirect in `App.tsx`**

In the route guard / auth check logic (wherever `onboarded` is checked), add: if user is signed in and `handle === null`, redirect to `/welcome` (unless already on `/welcome`, `/terms`, `/settings`, or `/signin`). This ensures every new user is nudged but not hard-locked.

Look at how the existing `onboarded` redirect is done in `App.tsx` and follow the same pattern.

- [ ] **Step 4: Update `Settings.tsx` — Profile section**

Add a "Profile" section that:
- Shows current handle (or "No handle set" + button to open `/welcome`)
- Toggle for `profile_public` (checked = public; PATCH on change)
- Link to public profile `/u/<handle>` when handle is set
- Link to `/terms` to re-read terms

Fetch `GET /api/me/profile` on mount to populate.

- [ ] **Step 5: Run full web test suite**

```bash
cd web && npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PrefsForm.tsx web/src/pages/Onboarding.tsx web/src/pages/Settings.tsx web/src/App.tsx
git commit -m "feat: handle setup flow in onboarding + profile section in Settings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Docs + Handoff

**Files:**
- Create: `docs/sessions/2026-10-23-public-profile.md`
- Modify: `docs/CONTEXT.md` (update Resume here + Current status)
- Modify: `docs/ROADMAP.md` (tick Step 3 items)
- Modify: `docs/DECISIONS.md` (append D-056)

- [ ] **Step 1: Append D-056 to `docs/DECISIONS.md`**

```
## D-056 — 2026-10-23 — Public profile design decisions

- Handle format: `/^[a-z][a-z0-9-]{2,29}$/`, 3–30 chars, starts with letter
- Reserved handles: admin, api, u, leaderboard, terms, settings, events, signin
- `profile_public = false` returns 404 (not 403) to avoid confirming the handle exists
- Activity ○ marks (scored-not-registered) are owner-only; never in public API response
- Terms + 18+ accepted atomically with first handle set; can't split into two calls
- Onboarding step 3 (handle) is skippable via "I'll do this later" link
- Profile redirect (no handle → /welcome) is a nudge, not a hard gate
- Status: implemented
```

- [ ] **Step 2: Tick ROADMAP.md**

Mark Step 3 (Public profile) items as done: public profile page, handle setup, Terms page.

- [ ] **Step 3: Write session log**

`docs/sessions/2026-10-23-public-profile.md` — goal, files changed, decisions, test results, next steps (Step 4: interest graph).

- [ ] **Step 4: Update `docs/CONTEXT.md`**

Update "Resume here" to Step 4 (interest graph). Update "Current status" table row for Step 3 to ✅ complete.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: session handoff 2026-10-23 public-profile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
