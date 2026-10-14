# GitHub Actions cron behaviour

- **Date:** 2026-10-14 (from planning session)
- **Status:** partly **unverified** — see open questions.
- **Sources:** https://github.com/petry-projects/.github-private/discussions/656 ·
  https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule

## Findings
- Scheduled runs are often delayed 30–60 min, especially at the top of the hour → use an odd minute.
- In public repos, scheduled workflows are disabled after 60 days with no repository activity.
- Public repos get unlimited free Actions minutes; private repos 2,000 min/month on Free.
- Cron is in UTC. `17 23 * * *` = 04:47 IST next calendar day (D-018).

## Open questions
- Does a commit on a **non-default branch** (`status`) count as repository activity? (D-023)
  Test: rely on it and watch for a disabled-workflow warning, or find an authoritative doc statement.
- Do commits made with `GITHUB_TOKEN` count as activity? (They don't trigger other workflows; activity
  counting is a separate question.)

## Next
- Phase 0: answer both open questions; update D-023 if the fallback is needed.
