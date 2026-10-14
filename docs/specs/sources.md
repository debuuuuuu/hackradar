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
  | `organization_name` | organizer | |
  | `registrations_count` | event_sources.registrations | refreshed every run, not hashed (D-031) |

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

- **Not available in listing:** event start date, submission deadline. `isPaid` + `payment_services[].amount` → `entry_fee` (e.g. `₹200`; no currency field, assumed INR; 58 of 262 open
  listings on 2026-10-15). `registerCount` → `event_sources.registrations` (D-031).
- **Fixture:** `tests/fixtures/unstop/open_hackathons_2026-10-14.json` — 8 real items covering hybrid, offline,
  online, dollar prize, multi-rank rupee prize, non-cash prize, solo, paid; HTML `details` removed.

### Devfolio — Phase 2 (endpoint verified 2026-10-15)
- **Endpoint:** `GET https://api.devfolio.co/api/hackathons?filter=application_open&page=N` → `{result, count, pages}`
  (14 open on 2026-10-15). No auth.
- **robots.txt:** devfolio.co and api.devfolio.co allow all (verified 2026-10-15). Terms silent on automation.
- **Fields:** name, slug, starts_at, ends_at, is_online, city/state/country, themes, prizes, team_min/team_size,
  participants_count, verified, devfolio_official, `hackathon_setting.reg_ends_at` (**registration deadline**).
- **Drop from raw:** `hackathon_setting.contact_email`. **Fixture:** todo.
- Details: research/2026-10-15-phase2-sources.md

### MLH — Phase 2 (endpoint verified 2026-10-15)
- **Endpoint:** `https://www.mlh.com/seasons/2027/events`; parse embedded JSON
  `<script data-page="app" type="application/json">` → `props.upcomingEvents[]`.
- **robots.txt:** allows `/` (verified 2026-10-15). Terms: personal, non-commercial use only → title/date/link only.
- **Fields:** name, slug, startsAt, endsAt, location, formatType, websiteUrl, region, venueAddress{city,state,country}.
- **Coverage:** 1 of 66 upcoming in India (2026-10-15) → low priority. **Fixture:** todo.

## Next sources
| Source | Order | Notes |
|---|---|---|
| Luma | Phase 2 (D-033) | Curated calendar ICS feeds only; start date, no deadline/prize. See research/2026-10-15-luma.md |
| Hack2Skill | next (D-022) | Strong Indian coverage; robots.txt + endpoints unchecked |
| DoraHacks | later | Web3-heavy, global |
| HackerEarth | later | Corporate/hiring hackathons |

## Discovery (Phase 4)
- **Search:** Tavily → Exa (via Agent Reach, no key) → Serper. ~10 queries/day, e.g.
  `site:linkedin.com/posts hackathon Pune 2026`, `site:x.com hackathon India registration`.
- **Read:** Jina Reader fetches each public result page as clean text.
- **Extract:** AI pulls title, dates, registration link, themes. Posts without a registration link are dropped.
- **Trust:** shown as ⚠️ unverified until matched to a platform listing or official domain; link-alive check (D-031).
- **Stop rule:** drop results whose event date is past, posts older than ~90 days, and posts without a registration link;
  finished events are never shown (research/2026-10-15-linkedin-search-test.md).
- **Never:** logged-in LinkedIn/X/Reddit access (Agent Reach cookie channels stay off, D-009).
