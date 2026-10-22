# Session 2026-10-22 to 23 · Docs refresh, product plan, docs audit

## Goal
Bring the stale docs in line with what is live, then work out with Debjit what HackRadar really is and how it should work.

## Done
- Docs refresh: ROADMAP (Phase 1 gate and Phase 2/3/5 items ticked), ARCHITECTURE (status, new tables, who sends), CONTEXT (resume block, status, D-044 to D-049).
- Product design written with Debjit (brainstorming; reviewed by a builder-check subagent): [spec](../superpowers/specs/2026-10-23-hackradar-product-design.md). Status: **draft, awaiting approval**.
- Plain-language explainer page [design/hackradar-product.html](../design/hackradar-product.html), published as a private artifact.
- Decisions D-050 (public profile + Terms/18+ checkbox), D-051 (only interest tags to AI), D-052 (leaderboard).
- Docs audit: CONTEXT hard constraints (₹0 → D-044), decision list (D-039 to D-043, D-050 to D-052), doc index, research and session indexes; ARCHITECTURE repo layout, routes and API list now match the code; features.md points to the product design; root `.env.example` gained `SITE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, `DISCORD_CLIENT_ID`.

## What Debjit said (2026-10-22/23)
- Users don't want to search every site; they want one page with recommendations they actually want, not everything.
- Recommendations use everything combined: topic, prize, format, team/solo, eligibility, **and whether they are free that day**.
- From a pick: save it or register directly; add to calendar.
- GitHub-streak-style page of hackathons; interest graph "like Neo4j" for recruiters.
- Profiles public by default; a Terms checkbox (nobody under 18 now).
- Grid shows past hackathons in your interests with 2–3 marks; recruiters see only what you attended; match the site theme.
- Asked about LinkedIn/X; asked for a leaderboard of people.

## Findings
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are **not** GitHub secrets (checked with `gh secret list`, 2026-10-23), so the daily Supabase keep-alive step is skipped. Risk: the free Supabase project pauses after ~1 week idle, which would break password sign-in.
- ARCHITECTURE claimed `/admin` can trigger a pipeline run; it only shows stats.
- There is no saves API; `/my-events` is a shell.

## Problems
- PowerShell heredoc commit messages fail; build the message in a variable.

## Next steps
1. Debjit approves the product design (or edits it).
2. Add the Supabase secrets to GitHub (needs Debjit's OK).
3. Write the build plan for step 1 ("For you" picks + busy dates).
4. Collect friends' feedback on the emails.
