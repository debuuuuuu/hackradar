# First live digest (2026-10-15)

_As of 2026-10-15 (IST). Source: GitHub Actions run 38625693804, Neon `runs` table._

## Result
- `workflow_dispatch` run 7 (2026-10-14 19:40–19:45 UTC): Devpost 49 listings (48 same, 1 changed),
  Unstop 251 (12 new, 230 same, 9 changed), 3 past events closed. Discord webhook returned **204** → digest delivered.
- 309 open events after the run.

## Bug found: "new" counted 186 instead of ~12
- **Root cause:** "new" was `first_seen_at > previous successful run's started_at`. Run 6 (local) took ~3 min and
  inserted most Unstop events *during* the run, so their `first_seen_at` was after run 6's start and they counted
  as new again.
- Second flaw in the same rule: a run that sends no digest (local run without webhook) still moved the cutoff,
  so its new events would never reach Discord.
- **Fix (2026-10-15):** `digest.last_digest_at()` = `max(finished_at)` of runs with `notifications_sent > 0`.
  Verified against live data: next digest would show 0 new, 87 closing, 309 open.

## Runtime
- The Unstop step took ~3.5 min although only 21 of 251 listings were new/changed: each upsert is several
  round trips from the US-hosted runner to Neon Singapore. Acceptable now (whole job ~5 min, far below
  free-minute limits); batch upserts if sources grow.

## Gotcha
- `.env` line had a space after `=`. python-dotenv strips it; values copied to GitHub Secrets must be trimmed
  (`tr -d ' \r\n"'`).

## Trust fields (verified 2026-10-15 against live data)
- Unstop `isPaid: true` = required registration fee: `payment_services: [{amount: 200, required: 1, ...}]`.
  No currency field (assumed INR — **unverified** for non-Indian listings). 58 of 262 Unstop listings paid.
- Unstop `organisation.{name, tier, official_email_domains}`, `approved_date`, `registerCount`, `viewsCount`.
- Devpost `organization_name`, `managed_by_devpost_badge`, `registrations_count`, `invite_only` (6 open).
- Open events on 2026-10-15: 0 without organiser, 0 with inconsistent dates.
- Adding `entry_fee` to the hashed fields made every event "changed" once (run 8); harmless.
