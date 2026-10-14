# HackRadar — Sources

_Last updated: 2026-10-14_ · Everything here comes from the planning session and is **unverified** until
re-checked while building each scraper. When a scraper is built, update its row with the verified endpoint,
fields, the robots.txt check date, and a saved fixture path.

**Rules for every source (D-002):** robots.txt-allowed paths only · clear User-Agent identifying HackRadar
with a contact URL · ~1 req/s per host · retries with backoff · once a day · no logins or cookies ·
per-source on/off flag in `config/sources.yaml` · fixture test from a saved real response.

## Core four

### Devpost — Phase 1 ✅ built 2026-10-14 (`pipeline/sources/devpost.py`)
- **Endpoint (verified 2026-10-14):** `GET https://devpost.com/api/hackathons?status[]=open&per_page=40&page=N`.
  Default page size is **9**; `per_page=40` works. Response: `{"hackathons": [...], "meta": {"total_count", "per_page"}}`.
  Paginate until collected >= `total_count` (48 open on 2026-10-14 → 2 requests).
- **Method:** JSON API (undocumented: devpost.com's own frontend calls it; may change without notice).
- **robots.txt (checked 2026-10-14):** `User-agent: *` with empty `Disallow:` → all allowed; only named bots
  (Bytespider, BLEXBot, …) are banned.
- **Field mapping:**

  | Devpost field | → events | Notes |
  |---|---|---|
  | `id` | source_id | |
  | `url` | event_sources.url | |
  | `title`, `organization_name` | title, organizer | |
  | `submission_period_dates` | start_date, submission_deadline (= end_date) | Display text only, 3 formats: `Aug 31 - Oct 23, 2026`, `Oct 12 - 24, 2026`, `Dec 15, 2026 - Jan 10, 2027`. Stored as 00:00 IST (D-028) |
  | `displayed_location.icon` | mode | `globe` → online, `map-marker-alt` → offline (no hybrid signal) |
  | `displayed_location.location` | city | Free text ("Stanford University", "jaipur", "Vikrant University , Gwalior") |
  | `prize_amount` | prize_text | HTML `$<span data-currency-value>138,000</span>`; `$`/`₹`/`€`; `0` → null |
  | `themes[].name` | themes | |
  | `invite_only` | invite_only | 6 of 48 on 2026-10-14 |

- **Not available:** registration deadline (registration stays open until the submission deadline →
  `reg_deadline` null), eligibility, team size, exact deadline time/timezone.
- **Volatile fields kept out of the hash:** `time_left_to_submission`, `registrations_count`
  (the hash uses normalized fields only).
- **Fixture:** `tests/fixtures/devpost/open_page2_2026-10-14.json` (real page 2, 8 items).

### Unstop — Phase 1 ✅ built 2026-10-14 (`pipeline/sources/unstop.py`)
- **Endpoint (verified 2026-10-14):**
  `GET https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&per_page=100&page=N`
  (send `Accept: application/json`). Laravel pagination; stop when `page >= last_page`. `total` overcounts
  (276 vs 250 real) and pages come back short — don't rely on either.
- **robots.txt (checked 2026-10-14):** `Allow: /api/public/*`, `Disallow: /api/*`, `Disallow: /competitions/*/register`.
  Needs a wildcard-aware parser → Protego (D-029). **Never** call other `/api/*` paths or register pages.
- **Field mapping:**

  | Unstop field | → events | Notes |
  |---|---|---|
  | `id` | source_id | |
  | `seo_url` | event_sources.url | `https://unstop.com/hackathons/<slug>-<id>` |
  | `title`, `organisation.name` | title, organizer | |
  | `region` | mode | online / offline / hybrid |
  | `address_with_country_logo.city`, `.country.name` | city, country | only for offline/hybrid; often empty |
  | `regnRequirements.end_regn_dt` | reg_deadline | exact ISO, +05:30 |
  | `end_date` | end_date | exact ISO, +05:30 |
  | `prizes[].cash` + `currency` | prize_text | summed per currency: `₹12,000`, `$100 + ₹7,000`; no cash → null |
  | `workfunction[].name` + `required_skills[].skill_name` | themes | deduped, order kept |
  | `filters[type=eligible].name` | eligibility | e.g. "Engineering Students, Undergraduate" |
  | `regnRequirements.min/max_team_size` | team_size | `"2-4"`, `"1"` |

- **Not available in listing:** event start date, submission deadline. `isPaid` (paid registration) only in raw_json.
- **Fixture:** `tests/fixtures/unstop/open_hackathons_2026-10-14.json` — 8 real items covering hybrid, offline,
  online, dollar prize, multi-rank rupee prize, non-cash prize, solo, paid; HTML `details` removed.

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
