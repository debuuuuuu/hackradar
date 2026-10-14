# LinkedIn discovery test (2026-10-15)

_One-off test with the Claude Code WebSearch tool (standard mode), restricted to linkedin.com. Not the Phase 4 pipeline._

## Queries
1. `IoT hackathon India 2026 registration open site:linkedin.com/posts` → 10 posts, almost all 2023-2024
   (HackSavvy-24, IEEE IC Hack, IIT Delhi 2023). One 2026 lead (Tata Technologies InnoVent 2026), date unconfirmed.
2. `IoT hackathon Pune October 2026 registration` → mostly profile pages, no event posts.

## Findings
- Search does not rank by recency; old/finished hackathons dominate.
- Result text had no usable deadlines; dates must come from source data, not AI/snippets.
- Events we already track (Build for Bharat, OpenCV AI Competition) came from Devpost/Unstop with real deadlines;
  LinkedIn added nothing new in this test.
- Not tested: Tavily / Exa / Serper + Jina Reader (the real Phase 4 stack). Still **unverified**.

## Rule added (Debjit, 2026-10-15): finished hackathons must never be shown
Discovery results are dropped unless ALL hold:
- extracted event date (start or end) is in the future (IST),
- the post/page is recent (≤ 90 days old, tunable),
- it carries a registration link,
- it is not already in the DB (dedupe against platform listings).
Posts that fail the future-date check are discarded, never stored as open.
Anything kept is marked ⚠️ unverified (D-031). Existing `close_past_events` also closes stored events after their end date.
