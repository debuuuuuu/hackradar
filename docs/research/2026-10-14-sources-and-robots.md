# Sources and robots.txt

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** — re-check each robots.txt and endpoint when building its scraper.

## Findings
| Source | Access path | robots.txt (per planning) | Source URL |
|---|---|---|---|
| Devpost | Public JSON `devpost.com/api/hackathons?status[]=open`, 40/page | to check | https://devpost.com/api/hackathons?status[]=open&per_page=5 |
| Unstop | `/api/public/*` only; never register pages | allows `/api/public/` | https://unstop.com/robots.txt |
| Devfolio | listing page | allows all | https://devfolio.co/robots.txt |
| MLH | listing moved to mlh.com; current URL unknown | to check | https://www.mlh.com/robots.txt |
| Hack2Skill | unknown | unchecked | — |
| DoraHacks | unknown | unchecked | — |
| HackerEarth | unknown | unchecked | — |

## Notes
- Devpost's endpoint is undocumented (frontend API), so it can change silently → fixture tests + zero-results alert.
- robots.txt respect is enforced in code by `sources/base.py` (planned), not just by convention.

## Next
- When building each scraper: fetch robots.txt, save it with the date, record allowed paths in `specs/sources.md`.
