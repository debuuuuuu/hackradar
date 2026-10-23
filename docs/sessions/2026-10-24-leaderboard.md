# Session: Leaderboard (Step 3b)

**Date:** 2026-10-24
**Goal:** Build `/leaderboard` — public ranking of hackathon builders by verified activity.

## Done

- **Leaderboard API** (`web/server/leaderboard.ts`, `web/server/leaderboard-routes.ts`):
  - `GET /api/leaderboard?period=month|all&theme?&city?&limit?&offset?`
  - Points: registered=1, submitted=3 (project_url gate), won=10 (project_url gate)
  - `RANK()` window function, tie-broken by `first_scored_at ASC NULLS LAST`
  - Period filter in IST; theme/city filters via `preferences` table
  - `myRank`/`myRow` for signed-in users outside the visible window
  - 8 tests in `web/tests/leaderboard.test.ts`

- **Leaderboard page** (`web/src/pages/Leaderboard.tsx`):
  - SWR with array key; period tabs (chip/chip on); theme dropdown (8 options); city input (400ms debounce)
  - Medal cards for top 3 (coral/ink/cream); `isMe` row highlight (coral border)
  - PinnedSelf "You are #N" strip when `myRank` present
  - Empty + loading states; `/leaderboard` route added to `App.tsx`

- **Docs:** ROADMAP.md Step 3b ticked, D-057 appended to DECISIONS.md

## Files changed

- `web/server/leaderboard.ts` (created)
- `web/server/leaderboard-routes.ts` (created)
- `web/server/router.ts` (modified)
- `web/tests/leaderboard.test.ts` (created)
- `web/src/pages/Leaderboard.tsx` (created)
- `web/src/App.tsx` (modified)
- `docs/ROADMAP.md` (modified)
- `docs/DECISIONS.md` (modified — D-057)

## Decisions

D-057: leaderboard implementation choices — points formula, tie-breaking, IST period, filters, myRank pinning, no migration needed.

## Problems / findings

None. Both task reviews came back clean on first pass.

## Next steps

- Merge PR, push to Vercel
- Step 4: Interest graph / recruiter view (spec §6.4 interest graph section)
- Add `CAL_FEED_SECRET` to Vercel (ICS feeds still broken in production)
