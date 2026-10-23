# Session: public profile (Step 3)

**Date:** 2026-10-23
**Branch:** `feat/public-profile`
**Plan:** `docs/superpowers/plans/2026-10-23-public-profile.md`

## Goal

Build Step 3 of the product plan: each user gets a public profile at `/u/<handle>` with the activity grid (○ ● ★), counts, a Terms page, and a Terms + 18+ checkbox at first handle setup (D-050).

## Done

Tasks 1 to 5 complete. Task 5 is this docs handoff.

- Task 1: migration 0015 adds `handle`, `terms_accepted_at`, `profile_public` to `users`. Applied to Neon.
- Task 2: profile API (4 endpoints, reserved handles, handle check, own-profile PATCH) with tests.
- Task 3: Profile page (activity grid, count badges, owner visibility toggle, privacy-safe 404) and static Terms page; routes `/u/:handle` and `/terms`. Fix round 1 applied.
- Task 4: onboarding now has 3 steps (name, prefs, handle with Terms + 18+ checkbox); "I'll do this later" skips step 3. Handle nudge redirect in App. ProfileSection in Settings.
- Task 5: this handoff.

## Files changed (key)

- `pipeline/migrations/0015_profile.sql`, `pipeline/models.sql`
- `web/server/profile.ts`, `web/server/profile-routes.ts`, `web/server/router.ts` (`registerProfileRoutes()`), `web/server/auth.ts` (`handle` on `PublicUser`)
- `web/tests/profile.test.ts`
- `web/src/pages/Profile.tsx`, `web/src/pages/Terms.tsx`, `web/src/pages/Onboarding.tsx`, `web/src/pages/Settings.tsx`
- `web/src/App.tsx` (routes and handle nudge), `web/src/lib/me.ts`, `web/src/components/PrefsForm.tsx`
- `docs/DECISIONS.md` (D-056), `docs/ROADMAP.md`, `docs/CONTEXT.md`

Commits: c4de192, d172e18, 75d4082, c1667ad, ea6f765, plus this docs commit.

## Decisions

- D-056: handle format `/^[a-z][a-z0-9-]{2,29}$/`; reserved handles; `profile_public = false` gives 404 not 403; ○ marks are owner-only; Terms + 18+ accepted atomically with first handle; onboarding step 3 skippable; profile redirect is a nudge, not a gate.

## Known issues (deferred minors)

- Terms page is plain text, not legal advice. DPDP Act 2023 research note still needed before public promotion (**unverified** rules).
- Profile redirect exempts `/welcome`, `/terms`, `/settings`, `/signin`; any new public route needs the same check.
- Activity ○ marks depend on picks data; the owner view shows nothing new until Step 1 and Step 2 migrations (0013, 0014) are applied on Neon.
- Leaderboard (Step 3b) not started; it needs the `won` and `project_url` fields from migration 0014.
- Migration 0015 is applied to Neon, but the branch is not merged to `main`.

## Next steps

1. Merge the Step 1, Step 2 and Step 3 branches after applying migrations 0013, 0014 and 0015 to Neon (confirm order with Debjit).
2. Step 3b: leaderboard `/leaderboard` (D-052).
3. Step 4: interest map for recruiters, then Step 5 (LinkedIn/X discovery, Phase 4).
