# Hosting, database, email and Discord limits

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** unless noted.

## Findings
- **Neon free:** 0.5 GB per project; scales to zero after ~5 min idle; never pauses the project.
  Cold start on wake is hundreds of ms to a few seconds (planning said "ms" — likely optimistic).
  Source: https://neon.com/guides/neon-vs-supabase-free-plan
- **Supabase free:** projects pause after ~1 week inactivity → rejected (D-005).
- **Vercel Hobby:** free, no card, non-commercial use only; Vercel cron on Hobby is limited → not used as
  scheduler. Source: https://vercel.com/docs/cron-jobs/usage-and-pricing
- **Discord interactions:** initial response required within 3 s; a deferred response (type 5) lets the bot
  send the real answer via follow-up webhook within 15 min (D-020). This is standard Discord API behaviour.
- **Gmail SMTP:** App Password requires 2-Step Verification; ~500 recipients/day.
  Source: https://serversmtp.com/limits-of-gmail-smtp-server/

## Open questions
- Can a Vercel **Python** function continue work after returning the deferred ACK? (Phase 3 spike)
- Is pgvector available on Neon free? (Phase 4)

## Update 2026-10-14 (Phase 0) — Neon project created (verified)
- Project `hackradar` (id `proud-bar-84693777`), region `aws-ap-southeast-1` (Singapore), Postgres **18**,
  database `hackradar`, role `hackradar_owner`, compute 0.25 CU, pooled endpoint.
- Extensions available: **pgvector 0.8.6**, **pg_trgm 1.6**, pgcrypto 1.4 → pgvector open question answered: yes.
- Project API reports `branch_logical_size_limit` = 1 GiB (plan said 0.5 GB; treat 0.5 GB as the safe budget
  until checked on https://neon.com/pricing).
- Account already has 4 other projects (5 total now); free-plan project cap not checked (unverified).
- Local run: connect + insert + update took ~100 ms on a warm compute.
