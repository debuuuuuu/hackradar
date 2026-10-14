# Agent Reach

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** — test from GitHub Actions in Phase 4.
- **Source:** https://github.com/Panniantong/Agent-Reach

## Findings
- Free, open-source tool bundling several web-access channels.
- HackRadar uses only the **no-login** tools (D-009):
  - **Exa search** — backup to Tavily, no key needed.
  - **Jina Reader** — turns a public LinkedIn post or event page into clean text.
  - **RSS reading** — for clubs/organizers with feeds.
- Its cookie-based X / LinkedIn / Reddit channels stay **off**: ban risk, cookies expire every few weeks,
  and they get blocked from GitHub's datacenter IPs.

## Open questions
- Does Exa no-key access work from GitHub Actions runner IPs?
- Can we call Jina Reader / Exa directly over HTTP instead of depending on Agent Reach as a package?
  (Fewer moving parts — evaluate in Phase 4.)
