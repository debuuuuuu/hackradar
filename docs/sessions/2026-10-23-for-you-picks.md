# Session: For You Picks — Step 1 build

_Date: 2026-10-23_

## Goal

Build Step 1 of the approved product design: "For you" picks with busy dates, AI fit scoring, and per-channel picks blocks. Also: product design approval, docs refresh, Graphify added.

## Done

### Product & design
- Approved product design (`docs/superpowers/specs/2026-10-23-hackradar-product-design.md`): picks, busy dates, public profile, leaderboard, interest map, LinkedIn/X discovery, build order.
- Published explainer HTML artifact (`docs/design/hackradar-product.html`).
- Decisions D-050 through D-054 recorded.

### Code (all on `feat/for-you-picks`, PR #10 stacked on docs PR #8)
- `pipeline/busy.py` — `Period`, `periods_for`, `clash_label`
- `pipeline/migrations/0013_busy_periods.sql` — `busy_periods` table (**not yet applied to Neon**)
- `pipeline/rank.py` — `topic_hits`, `shortlist`, `load_candidates`, `score_all`, `score_safely`
- `pipeline/ai/score.py` — prompt, parse_reply, reason validation, defanging
- `pipeline/ai/base.py` / `groq.py` — `RateLimited`, retry-after cap 60 s
- `pipeline/digest.py` / `user_digest.py` — `DigestItem.event_id/why/clash`, `Digest.picks`, `drop_picks`, `_picks`, `Recipient.has_themes`
- `pipeline/notify/discord.py` / `email.py` / `whatsapp.py` — picks blocks
- `pipeline/run.py` — `score_safely` wired between enrich and sends; `ensure_alive`
- `config/topics.yaml`, `config/settings.yaml` — shortlist 12, max_seconds 480, max_groups 40
- `web/server/busy.ts`, `busy-routes.ts`, `picks.ts`, `picks-routes.ts` — CRUD + scoring endpoints
- `web/server/prefs.ts` — scores deleted on topic/format change
- `web/src/components/BusyForm.tsx`, `pages/Settings.tsx`, `pages/Today.tsx` — UI
- `web/tests/busy.ts`, `picks.ts`, `helpers.ts` — DB-backed tests; `busy_periods` in GUARDED_TABLES
- `.graphifyignore`, `.gitignore` additions, `graphify-out/` excluded

### Docs
- `docs/ROADMAP.md` — Step 1 ticked
- `docs/CONTEXT.md` — Resume-here and Current status updated
- `docs/ARCHITECTURE.md` — repo layout updated (score.py, rank.py, busy.py)
- `docs/DECISIONS.md` — D-054 appended
- `docs/design/hackradar-product.html` — Step 1 row marked "Built"
- `docs/research/2026-10-23-product-research.md`, `2026-10-23-graphify.md`
- `docs/sessions/` — this file

## Files changed (key)

`pipeline/busy.py`, `rank.py`, `ai/score.py`, `ai/base.py`, `ai/groq.py`, `digest.py`, `user_digest.py`, `notify/{discord,email,whatsapp}.py`, `run.py`, `migrations/0013_busy_periods.sql`, `config/topics.yaml`, `config/settings.yaml`, `web/server/{busy,picks,prefs,busy-routes,picks-routes,router}.ts`, `web/src/components/BusyForm.tsx`, `web/src/pages/{Settings,Today}.tsx`, `web/src/lib/api.ts`, `web/tests/{busy,picks,helpers}.ts`, `.graphifyignore`.

## Decisions made

- **D-054**: Clash rule (offline/hybrid span overlap or submit_deadline inside period; online never clashes); scoring budget 480 s / 40 groups; picks only from New/Closing; score reset on topic/format change; picks failure never stops digest. Parked: score copy across same-tag users, web place/format picks, picks for digest-off users, score refresh on event text change.

## Rulings made (controller overrides during review)

- `_picks` brief said "N more"; actual behaviour accumulates exact seen-set across shortlist to keep count correct — ruling: keep the implementation, update the spec comment.
- Task 5 inflated-N-more / vanishing-picks: brief said X; implementation had a subtle off-by-one on the `seen` set — ruling: fix implementation, keep spec intent unchanged.
- Final review C1/C2/I1–I5 wave: all five fixed in one round, re-reviewed.

## Problems / open items

- **Migration 0013 not applied to Neon.** Without it, picks/busy return 500 for scored users. The digest still sends without picks. Must apply before merging PR #10.
- **Supabase keepalive table missing.** Secrets set; SQL to create table given to user.
- **Discord webhook leaked** into two subagent transcripts during development — rotate `DISCORD_WEBHOOK_URL` in `.env` + GitHub secret.
- **Graphify `--project` install** blocked by classifier (Self-Modification) — not bypassed; user can run `graphify install --project --platform claude` manually.
- **Task 6 source unknown** — commits appeared outside the SDD loop; code reviewed and approved.

## Next steps

1. **User**: apply migration 0013 to Neon (`pipeline/migrations/0013_busy_periods.sql`). Update README row from "Pending" to "Applied 2026-10-23".
2. Merge docs PR #8, then merge picks PR #10.
3. Watch next daily run: scoring is bounded; a Groq rate-limit stops scoring early (digest still sends).
4. **User**: run Supabase keepalive SQL; rotate Discord webhook.
5. Plan Step 2: Save / Register / Add to Google Calendar + reminders.
