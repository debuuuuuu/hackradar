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
- **Fixed 2026-10-15:** `db.upsert_events` does one lookup query per source, then pipelined `executemany`
  writes in one transaction. Local run (Pune → Neon Singapore): whole pipeline 155 s → **14.6 s** (run 9);
  storing is ~1 s, the rest is polite 1 req/s fetching. Paths verified in a rolled-back transaction.

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

## Cross-platform duplicates (found 2026-10-15, input for Phase 2 dedupe)
- "Multimodal AI Hackathon 2026" is on Devpost (organiser "Kamand Prompt, IIT Mandi", submit 15 Oct) **and** Unstop
  (organiser "Indian Institute of Technology (IIT), Mandi", 21 Oct 23:52). Same event, different organiser strings
  and different deadlines.
- "CodeSprint by Elite Coders" (Devpost, online) vs "Codesprint 2026" (Unstop, Elite Coders, hybrid Dehradun).
- So dedupe can't rely on exact title/organiser; keep every source's dates and show the earliest as the one to act on.

## City names are messy (2026-10-15)
- Open in-person events by `city`: Kalyanpur 17, Greater Noida 15, Delhi 9, Nagpur 9, West Delhi 9, New Delhi 8,
  Mumbai 6, East Delhi 4, Bangalore Urban 4, Bangalore 2, "Tripura Vasini Palace Grounds, Bengaluru" 1, Pune 3, Karjat 4.
- A place filter needs normalisation to metro areas (Delhi NCR ≈ 48) and distance from a home city (Pune + 150 km ≈ 14:
  Pune 3, Karjat 4, Mumbai 6, Thane 1). Geocoding service still to choose (free, no card, research first).

## Unstop's "hackathons" feed is not only hackathons (found 2026-10-15)
- 262 open items; 261 have `type: hackathons, subtype: online_coding_challenge` (1 `general_competition`), so the
  source's own fields cannot separate them.
- Seen: BGMI / Valorant tournaments, Poster Exhibition, Business Plan Competition, Robo Sumo / Robo Soccer, CTFs,
  quizzes, pitch contests. Roughly half the titles lack any hackathon-like word (131 of 261 match a loose keyword list).
- Proposed (Phase 2, needs Debjit's OK): AI tags each event `kind` = hackathon | coding contest | other, as a
  separate field, never touching dates/prizes; digest and dashboard get a "hackathons only" default.
