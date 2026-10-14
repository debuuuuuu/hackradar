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

## Update 2026-10-14 (Phase 0)
- **Keepalive works mechanically:** run 38579261227 (workflow_dispatch) committed `data/last_run.json` to an
  orphan `status` branch (only that file on the branch).
- **Does a non-default-branch commit count as activity? Still unverified.** GitHub docs only say "no repository
  activity in 60 days" without defining activity; community keepalive tools say "no commit in the repository".
  Sources: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows ·
  https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf
- **Mitigation:** during active development `main` gets commits anyway, so risk only appears after 60 quiet
  days. Fallbacks if it gets disabled: switch the keepalive to `main` (D-023 alt), or re-enable via API from
  another repo (pattern: https://github.com/PhrozenByte/gh-workflow-immortality). Roadmap task in Phase 6.
- **setup-uv has no floating major tags** (`@v10` fails "unable to find version"); pin exact (`v10.2.0`).
  actions/checkout does publish `v7`. Found 2026-10-14.
- **`ubuntu-latest` migrates to Ubuntu 26 from 2026-10-19** (runner annotation). Watch for breakage.
- Runner Python from uv: 3.12.3.
