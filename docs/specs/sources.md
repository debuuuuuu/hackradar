# HackRadar — Sources

_Last updated: 2026-10-14_ · Everything here comes from the planning session and is **unverified** until
re-checked while building each scraper. When a scraper is built, update its row with the verified endpoint,
fields, the robots.txt check date, and a saved fixture path.

**Rules for every source (D-002):** robots.txt-allowed paths only · clear User-Agent identifying HackRadar
with a contact URL · ~1 req/s per host · retries with backoff · once a day · no logins or cookies ·
per-source on/off flag in `config/sources.yaml` · fixture test from a saved real response.

## Core four

### Devpost — Phase 1
- **Endpoint:** `GET https://devpost.com/api/hackathons?status[]=open` (JSON), 40 per page, paginate with `page=`.
- **Method:** JSON API (undocumented — it's what devpost.com's frontend calls; may change without notice).
- **robots.txt:** to verify at build time.
- **Fields (expected):** title, url, organization name, submission period dates, prize amount, themes,
  displayed location / online flag, open state, registrations count. Exact keys unverified.
- **Quirks:** dates may be a display string range rather than ISO; prize may include HTML/currency markup.
- **Fixture:** `tests/fixtures/devpost/` (todo)

### Unstop — Phase 1
- **Endpoint:** `/api/public/*` search endpoints only (robots.txt allows these). Exact path todo.
- **Never:** register/login pages.
- **robots.txt:** https://unstop.com/robots.txt — "allows /api/public/" per planning; re-verify.
- **Fields:** todo. Expect registration deadline, start/end, mode, location, prize, eligibility, team size.
- **Quirks:** Unstop lists many non-hackathon "opportunities" — filter by type.
- **Fixture:** todo

### Devfolio — Phase 2
- **Endpoint:** listing page (exact URL/API todo).
- **robots.txt:** https://devfolio.co/robots.txt — "allows all" per planning; re-verify.
- **Fields:** todo. **Fixture:** todo.

### MLH — Phase 2
- **Endpoint:** season events page; listing **moved to the mlh.com domain** — current URL not yet found.
- **robots.txt:** https://www.mlh.com/robots.txt — to verify.
- **Fields:** name, dates, location, in-person/digital. **Fixture:** todo.

## Next sources
| Source | Order | Notes |
|---|---|---|
| Hack2Skill | next (D-022) | Strong Indian coverage; robots.txt + endpoints unchecked |
| DoraHacks | later | Web3-heavy, global |
| HackerEarth | later | Corporate/hiring hackathons |

## Discovery (Phase 4)
- **Search:** Tavily → Exa (via Agent Reach, no key) → Serper. ~10 queries/day, e.g.
  `site:linkedin.com/posts hackathon Pune 2026`, `site:x.com hackathon India registration`.
- **Read:** Jina Reader fetches each public result page as clean text.
- **Extract:** AI pulls title, dates, registration link, themes. Posts without a registration link are dropped.
- **Never:** logged-in LinkedIn/X/Reddit access (Agent Reach cookie channels stay off, D-009).
