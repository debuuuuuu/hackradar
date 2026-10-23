# Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/leaderboard` page ranked by verified hackathon activity (registered, submitted, won), with This Month / All Time tabs and interest + city filters.

**Architecture:** A new Hono route file computes scores with a single SQL `RANK()` window query over `user_events`; the frontend page uses SWR, two tabs (period), two filter dropdowns, medal cards for top 3, and a pinned "You are #N" strip for the signed-in user when they fall outside the visible window. No migration — all data exists.

**Tech Stack:** PostgreSQL window functions, Hono (server), React + SWR + TypeScript (frontend), existing `query`/`findUser`/`sessionFromRequest` patterns.

**Spec:** `docs/superpowers/specs/2026-10-23-hackradar-product-design.md` §6.6

---

## Global Constraints

- **Who appears:** `users.handle IS NOT NULL AND users.profile_public = true` only. Private profiles never shown.
- **Points:** `registered` status → 1 pt; `submitted` status + `project_url IS NOT NULL` → 3 pts; `won = true` + `project_url IS NOT NULL` → 10 pts. All other statuses (`saved`, `done`, `dismissed`) → 0 pts.
- **Tie-breaking:** higher points first; equal points broken by `MIN(ue.updated_at)` of scoring rows ASC (earlier = better).
- **Period filter:** "This month" = `ue.updated_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')`.
- **Interest filter** (`theme` param): `preferences.themes && ARRAY[$1::text]` — users whose saved themes overlap the filter value.
- **City filter** (`city` param): `preferences.home_city ILIKE $1`.
- **Page size:** default 50, max 100.
- **Signed-in user pinning:** if the user is public + has a handle but falls outside the returned window, include `myRank` + `myRow` in the response so the frontend can pin them.
- **Route:** `GET /api/leaderboard` — public (no auth required to view); auth optional (for `myRank`).
- **DB pattern:** `query` from `./db.js`; `sessionFromRequest` + `findUser` from `./auth.js`.
- **Test pattern:** `dbIt` + `withSchema` + `route()` + `signSession` in vitest.
- IST dates: all period arithmetic uses `AT TIME ZONE 'Asia/Kolkata'`.
- Reserved handle `leaderboard` already blocked in profile validation.

## Review Focus

- **Zero-row edge case:** user with only `saved` events scores 0 and must not appear (HAVING clause needed).
- **Private-profile users never leak:** query WHERE clause must include `profile_public = true`; `myRow` must also check this before returning.
- **Tie-breaking with NULL `last_scored_at`:** if a user has no scoring rows, `MIN(updated_at)` of scoring rows is NULL — must fall behind all scored users (NULLS LAST).
- **Period = "month" + city filter stack:** both must AND correctly; a user with no `preferences` row (LEFT JOIN) must be excluded by city filter, not shown as city = NULL.
- **`myRank` when user has 0 points:** user has a handle and public profile but 0 points → `myRank` should be absent (not shown as #N+1 below everyone).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/server/leaderboard.ts` | Create | Score query, `LeaderboardRow` type, `getLeaderboard`, `getMyRank` |
| `web/server/leaderboard-routes.ts` | Create | `GET /api/leaderboard` handler, param parsing, auth optional |
| `web/server/router.ts` | Modify | `registerLeaderboardRoutes()` call after profile routes |
| `web/tests/leaderboard.test.ts` | Create | 8 tests via `dbIt` + `withSchema` |
| `web/src/pages/Leaderboard.tsx` | Create | Page: tabs, filters, medal cards, pinned-self strip |
| `web/src/App.tsx` | Modify | Add `/leaderboard` route |

---

## Task 1: Leaderboard API

**Files:**
- Create: `web/server/leaderboard.ts`
- Create: `web/server/leaderboard-routes.ts`
- Modify: `web/server/router.ts`
- Test: `web/tests/leaderboard.test.ts`

**Interfaces:**
- Consumes: `query` from `./db.js`; `sessionFromRequest`, `findUser` from `./auth.js`; `route()` from `./router.js` (in tests)
- Produces:
  ```typescript
  // GET /api/leaderboard?period=month|all&theme?=string&city?=string&limit?=number&offset?=number
  interface LeaderboardRow {
    rank: number;
    handle: string;
    points: number;
    registered: number;
    submitted: number;
    won: number;
    isMe: boolean;
  }
  interface LeaderboardResponse {
    rows: LeaderboardRow[];
    total: number;        // total users with points > 0 matching filters
    myRank?: number;      // only if signed-in user is public, has handle, has points > 0, and is outside rows
    myRow?: LeaderboardRow;
  }
  ```

- [ ] **Step 1: Write failing tests**

  File: `web/tests/leaderboard.test.ts`. Imports: `dbIt`, `withSchema`, `query`, `route`, `signSession`. Helper `newUser(handle?)` inserts a user with `profile_public=true` and given handle; `newEvent()` inserts an event; `saveEvent(uid, eid, status, won?, project_url?)` inserts a `user_events` row; `newPrefs(uid, themes?, home_city?)` inserts or upserts a `preferences` row.

  ```typescript
  dbIt("GET /api/leaderboard returns empty rows when no users", () => withSchema(async () => {
    const res = await call("GET", null, "/api/leaderboard");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  }));

  dbIt("ranks by points: won > submitted > registered", () => withSchema(async () => {
    const u1 = await newUser("alice"); const e1 = await newEvent();
    await saveEvent(u1, e1, "registered");
    const u2 = await newUser("bob"); const e2 = await newEvent();
    await saveEvent(u2, e2, "submitted", false, "https://devpost.com/p");
    const u3 = await newUser("cara"); const e3 = await newEvent();
    await saveEvent(u3, e3, "submitted", true, "https://devpost.com/p");
    const body = (await (await call("GET", null, "/api/leaderboard")).json()) as LeaderboardResponse;
    expect(body.rows[0].handle).toBe("cara");  // 10 pts
    expect(body.rows[1].handle).toBe("bob");   // 3 pts
    expect(body.rows[2].handle).toBe("alice"); // 1 pt
  }));

  dbIt("submitted without project_url scores 0 and is excluded", () => withSchema(async () => {
    const u = await newUser("dave"); const e = await newEvent();
    await saveEvent(u, e, "submitted", false, null);  // no project_url
    const body = (await (await call("GET", null, "/api/leaderboard")).json()) as LeaderboardResponse;
    expect(body.rows).toHaveLength(0);
  }));

  dbIt("private profile users do not appear", () => withSchema(async () => {
    const u = await newUser("eve", false /* profile_public=false */); const e = await newEvent();
    await saveEvent(u, e, "registered");
    const body = (await (await call("GET", null, "/api/leaderboard")).json()) as LeaderboardResponse;
    expect(body.rows).toHaveLength(0);
  }));

  dbIt("period=month excludes last-month events", () => withSchema(async () => {
    // insert user_event with updated_at in previous month via raw SQL
    const u = await newUser("frank"); const e = await newEvent();
    await query("INSERT INTO user_events (user_id, event_id, status, updated_at, created_at) VALUES ($1,$2,'registered',now()-interval'40 days',now()-interval'40 days')", [u, e]);
    const body = (await (await call("GET", null, "/api/leaderboard?period=month")).json()) as LeaderboardResponse;
    expect(body.rows).toHaveLength(0);
  }));

  dbIt("theme filter: only users whose preferences.themes overlaps filter", () => withSchema(async () => {
    const u1 = await newUser("gina"); await newPrefs(u1, ["ai","web"]);
    const u2 = await newUser("hal");  await newPrefs(u2, ["blockchain"]);
    const e1 = await newEvent(); const e2 = await newEvent();
    await saveEvent(u1, e1, "registered"); await saveEvent(u2, e2, "registered");
    const body = (await (await call("GET", null, "/api/leaderboard?theme=ai")).json()) as LeaderboardResponse;
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].handle).toBe("gina");
  }));

  dbIt("myRank present when signed-in user is outside top window", () => withSchema(async () => {
    // 3 users with points; our user has 1 pt; request limit=2
    const u1 = await newUser("i1"); const u2 = await newUser("i2"); const me = await newUser("moi");
    const e1=await newEvent(); const e2=await newEvent(); const e3=await newEvent();
    await saveEvent(u1,e1,"submitted",false,"https://x"); await saveEvent(u2,e2,"submitted",false,"https://x");
    await saveEvent(me,e3,"registered");
    const res = await call("GET", me, "/api/leaderboard?limit=2");
    const body = (await res.json()) as LeaderboardResponse;
    expect(body.rows).toHaveLength(2);
    expect(body.myRank).toBe(3);
    expect(body.myRow?.handle).toBe("moi");
  }));

  dbIt("myRank absent when signed-in user has 0 points", () => withSchema(async () => {
    const me = await newUser("zero");
    const e = await newEvent(); await saveEvent(me, e, "saved");
    const res = await call("GET", me, "/api/leaderboard");
    const body = (await res.json()) as LeaderboardResponse;
    expect(body.myRank).toBeUndefined();
  }));
  ```

- [ ] **Step 2: Run tests — expect FAIL** (`route not found` / `leaderboard.ts does not exist`)

  ```bash
  cd web && npx vitest run tests/leaderboard.test.ts
  ```

- [ ] **Step 3: Implement `web/server/leaderboard.ts`**

  Export `LeaderboardRow`, `LeaderboardResponse`, `LeaderboardParams`.

  `getLeaderboard(params, callerUid?)` — one SQL query using a CTE:

  ```sql
  WITH scored AS (
    SELECT
      u.id,
      u.handle,
      SUM(CASE
        WHEN ue.won AND ue.project_url IS NOT NULL THEN 10
        WHEN ue.status = 'submitted' AND ue.project_url IS NOT NULL THEN 3
        WHEN ue.status = 'registered' THEN 1
        ELSE 0
      END)::int AS points,
      COUNT(*) FILTER (WHERE ue.status = 'registered')::int AS registered,
      COUNT(*) FILTER (WHERE ue.status = 'submitted' AND ue.project_url IS NOT NULL)::int AS submitted,
      COUNT(*) FILTER (WHERE ue.won AND ue.project_url IS NOT NULL)::int AS won,
      MIN(ue.updated_at) FILTER (WHERE
        (ue.won AND ue.project_url IS NOT NULL)
        OR (ue.status = 'submitted' AND ue.project_url IS NOT NULL)
        OR ue.status = 'registered'
      ) AS first_scored_at
    FROM users u
    JOIN user_events ue ON ue.user_id = u.id
    LEFT JOIN preferences p ON p.user_id = u.id
    WHERE u.handle IS NOT NULL
      AND u.profile_public = true
      [AND ue.updated_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')  -- period=month]
      [AND p.themes && ARRAY[$N::text]                                               -- theme filter]
      [AND p.home_city ILIKE $N                                                      -- city filter]
    GROUP BY u.id, u.handle
    HAVING SUM(...) > 0
  ),
  ranked AS (
    SELECT *, RANK() OVER (ORDER BY points DESC, first_scored_at ASC NULLS LAST) AS rank
    FROM scored
  )
  SELECT * FROM ranked
  ORDER BY rank, handle
  LIMIT $limit OFFSET $offset
  ```

  Also run `SELECT COUNT(*) FROM ranked` in the same call using a second CTE or a separate query (use one query with `SELECT *, COUNT(*) OVER () AS total`).

  `getMyRank(uid, params)` — same CTE filtered to `u.id = $uid`, returns `{rank, row}` or null if 0 points.

- [ ] **Step 4: Implement `web/server/leaderboard-routes.ts`**

  Single handler for `GET /api/leaderboard`:
  - Parse `period` (`month` | `all`, default `all`), `theme`, `city`, `limit` (max 100, default 50), `offset` (default 0).
  - `const session = sessionFromRequest(req); const caller = session ? await findUser(session.uid, session.iat) : null;`
  - Call `getLeaderboard(params, caller?.uid)`.
  - If `caller` is in `rows`, set `isMe: true` on that row.
  - If `caller` is not in `rows`, call `getMyRank(caller.uid, params)` — include `myRank`/`myRow` if points > 0.
  - Return JSON.

  Export `registerLeaderboardRoutes(app)`.

- [ ] **Step 5: Register routes in `web/server/router.ts`**

  Import and call `registerLeaderboardRoutes(app)` after the profile routes line.

- [ ] **Step 6: Run tests — expect PASS**

  ```bash
  cd web && npx vitest run tests/leaderboard.test.ts
  ```

- [ ] **Step 7: Run full suite — no regressions**

  ```bash
  cd web && npm test
  ```
  Expected: existing 155+ pass, 0 fail.

- [ ] **Step 8: Commit**

  ```bash
  git add web/server/leaderboard.ts web/server/leaderboard-routes.ts web/server/router.ts web/tests/leaderboard.test.ts
  git commit -m "feat: leaderboard API — score query, RANK window, myRank pinning"
  ```

---

## Task 2: Leaderboard page

**Files:**
- Create: `web/src/pages/Leaderboard.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/leaderboard` → `LeaderboardResponse` (from Task 1)
- Produces: `/leaderboard` route renders correctly for signed-out, signed-in (inside top), and signed-in (outside top) users

- [ ] **Step 1: Create `web/src/pages/Leaderboard.tsx`**

  State: `period: "all" | "month"`, `theme: string`, `city: string`.

  SWR key: `["/api/leaderboard", period, theme, city]` → fetch `/api/leaderboard?period=…&theme=…&city=…`.

  Layout (follow fun-theme card-paper / chip / btn patterns from existing pages):

  ```
  <header>
    <h1>Leaderboard</h1>
    <p class="lead">Top hackathon builders on HackRadar.</p>
  </header>

  <div class="tabs">               ← period chips
    [This month]  [All time ✓]
  </div>

  <div class="filters">
    <select>theme</select>
    <input placeholder="City…">city</input>
  </div>

  <ol class="leaderboard-list">
    {rows.map((row, i) => <LeaderboardRow key={row.handle} row={row} medal={i < 3 ? i : -1} />)}
  </ol>

  {myRank && <PinnedSelf rank={myRank} row={myRow} />}
  ```

  `LeaderboardRow` component: rank number, `<Link to={/u/${handle}}>@{handle}</Link>`, points badge, `{registered}R {submitted}S {won}W` counts, `isMe` → highlight with coral border.

  Medal styling (inline style, no new CSS class needed):
  - rank 1 → background `var(--coral)`, color `var(--charcoal)` (coral medal)
  - rank 2 → background `var(--ink)`, color `var(--chalk)` (ink medal)
  - rank 3 → background `var(--cream, #f5f0e8)`, color `var(--charcoal)` (cream medal)

  `PinnedSelf`: sticky strip at the bottom of the list showing "You are #N" with the same row styling. Only shown when `myRank` is present.

  Theme dropdown options (hardcoded): `""` (All), `"ai"`, `"web"`, `"mobile"`, `"blockchain"`, `"data"`, `"iot"`, `"security"`.

  Empty state: "No one here yet. Participate in a hackathon to appear."

- [ ] **Step 2: Add `/leaderboard` route in `web/src/App.tsx`**

  Add `import Leaderboard from "./pages/Leaderboard.js"` and `<Route path="/leaderboard" element={<Leaderboard />} />` inside `<Routes>`, after the `/terms` route.

- [ ] **Step 3: Run full suite — no regressions**

  ```bash
  cd web && npm test
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add web/src/pages/Leaderboard.tsx web/src/App.tsx
  git commit -m "feat: leaderboard page — tabs, filters, medal cards, pinned-self"
  ```

---

## Task 3: Docs + handoff

**Files:**
- Modify: `docs/ROADMAP.md` (tick Step 3b)
- Modify: `docs/DECISIONS.md` (append D-057)
- Create: `docs/sessions/2026-10-24-leaderboard.md`
- Modify: `docs/CONTEXT.md` (update Resume here + Current status)

- [ ] **Step 1: Tick Step 3b in `docs/ROADMAP.md`**

- [ ] **Step 2: Append D-057 to `docs/DECISIONS.md`**

  D-057 covers: points formula (registered=1/submitted=3/won=10, project_url gate), tie-breaking by `first_scored_at`, period filter IST boundary, no migration needed, theme/city filter on preferences table, `myRank` pinning strategy.

- [ ] **Step 3: Write session log `docs/sessions/2026-10-24-leaderboard.md`**

- [ ] **Step 4: Update `docs/CONTEXT.md`**

  Resume here → Step 3b done, next Step 4 (interest graph / recruiter view).

- [ ] **Step 5: Commit**

  ```bash
  git add docs/
  git commit -m "docs: session handoff 2026-10-24 leaderboard"
  ```

---

## Self-review

**Spec coverage:**
- G6 public leaderboard ✓ (Task 1 API + Task 2 page)
- Points formula (registered/submitted/won, project_url gate) ✓ (Task 1 Step 3 SQL)
- This month / All time tabs ✓ (Task 2 Step 1 + Task 1 `period` param)
- Interest + city filters ✓ (Task 1 Step 3 SQL + Task 2 Step 1 dropdowns)
- Public profile + handle required ✓ (Task 1 Step 3 WHERE clause)
- Tie-breaking ✓ (Task 1 Step 3 `first_scored_at ASC NULLS LAST`)
- Medal cards top 3 ✓ (Task 2 Step 1 `medal` prop)
- Signed-in user pinned ✓ (Task 1 `myRank`/`myRow`, Task 2 `PinnedSelf`)

**Review Focus mapped to tests:**
- Zero-row edge: "submitted without project_url scores 0" test (Task 1 Step 1)
- Private profiles never leak: "private profile users do not appear" test (Task 1 Step 1)
- Tie-breaking NULLS LAST: no dedicated test — implementer must use `NULLS LAST` in ORDER BY; reviewer checks SQL
- Period + city stacking: "period=month excludes last-month" test covers period; city tested via theme test pattern — implementer must verify both stack with AND logic
- myRank absent at 0 points: "myRank absent when signed-in user has 0 points" test (Task 1 Step 1)

**Proportion:** plan is specification-level, no function bodies other than the SQL CTE which is the non-obvious core decision.
