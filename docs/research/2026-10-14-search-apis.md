# Search APIs for LinkedIn/X discovery

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** — confirm free credits and no-card signup in Phase 4.

## Findings
| API | Free allowance (per planning) | Role |
|---|---|---|
| Tavily | 1,000 credits/month | Primary (D-008) |
| Exa (via Agent Reach) | No key needed via Agent Reach | Backup — must test from GitHub Actions IPs |
| Serper | 2,500 credits, one-time | Last fallback; don't waste in testing |

Source: https://parallel.ai/ai/articles/best-free-web-search-api

## Usage plan
- ~10 queries/day (~300/month) fits Tavily's monthly allowance with margin.
- Queries like `site:linkedin.com/posts hackathon Pune 2026`.

## Next
- Phase 4: verify credit cost per Tavily query type (basic vs advanced), and Exa no-key behaviour from a runner.
