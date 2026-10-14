# Free AI tiers (Gemini, Groq, Claude)

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** — exact limits change often; check official pages before Phase 2.

## Findings
- **Gemini (Google AI Studio):** free tier with per-model RPM and RPD caps for Flash / Flash-Lite; no card.
  Free-tier prompts may be used by Google to improve products → only public event text is sent (D-006).
  Embedding model also free under similar caps.
  Source: https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026 (third-party; prefer
  https://ai.google.dev/gemini-api/docs/rate-limits).
- **Groq:** free tier with org-level RPM/RPD caps; very low latency → chosen for `/ask` (D-007).
  Source: https://community.groq.com/t/is-there-a-free-tier-and-what-are-its-limits/790
- **Claude:** no free API tier; adapter kept so it can be switched in later via config.

## Implications
- Batch 10–15 events per summarize call; only new/changed events (content hash) go to AI.
- Retry with exponential backoff on 429; fall back to the other provider.

## Next
- Phase 2: record exact current RPM/RPD per chosen model with "as of" date and official URL.
