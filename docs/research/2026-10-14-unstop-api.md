# Unstop API behaviour and robots.txt parsing

- **Date:** 2026-10-14 · **Status:** verified live (robots.txt + ~25 API requests while exploring)
- **Sources:** https://unstop.com/robots.txt ·
  https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&per_page=100&page=1

## robots.txt
- `User-agent: *` → `Allow: /api/public/*`, `Allow: /hackathons/`, `Disallow: /api/*`,
  `Disallow: /competitions/*/register`, plus profile/certificate paths. AI crawlers allowed `/`; scraper bots (CCBot,
  Bytespider, …) and downloaders (Wget, HTTrack) disallowed.
- **Python's `urllib.robotparser` gets this wrong:** it ignores `*` wildcards and uses first-match instead of
  longest-match, so it returned *allowed* for `/api/private/x`, `/api/get-attachment/1` and
  `/competitions/x/register`. **Protego** (Scrapy's parser, RFC 9309) answers all five test URLs correctly → D-029.

## API
- Laravel-style pagination: `data.{current_page, last_page, per_page, total, next_page_url, data[]}`.
- `per_page=100` honoured. Pages come back **short** (93, 91, 66) and `total` (276) **overcounts**: both
  `per_page=15` (19 pages) and `per_page=100` (3 pages) return the same **250 unique** hackathons. Stop on
  `last_page`, never on `total`.
- All items `type=hackathons`, `status=LIVE`, `regn_open=1`; `region` online 104 / offline 118 / hybrid 28.
- Dates are exact ISO with `+05:30`: `regnRequirements.end_regn_dt` (registration deadline), `end_date`.
  **No event start date** in the listing.
- `prizes[]`: per-rank rows, `cash` int or null, `currency` `fa-rupee` (523) / `fa-dollar` (9).
- `address_with_country_logo.city` empty for most online events; country "India" for 153 of 250.
- `filters[type=eligible]` gives readable eligibility ("Engineering Students", "School Students",
  "Experienced Professionals", "All"). `regnRequirements.eligibility` is a large JSON string (not used).
- `isPaid` true for 49 of 250 (paid registration) — kept in `raw_json` only for now.
- Volatile: `registerCount`, `viewsCount`, `remain_days`, `remaining_time` (outside the hash).
- Each item carries a large HTML `details` field (~10 KB). Response for 100 items ~1 MB.

## Performance
- First upsert of 250 new events took ~2.5 min from Pune (Neon in Singapore, several round trips per event).
