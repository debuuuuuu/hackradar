# Phase 2 sources: Devfolio, MLH, geocoding

_As of 2026-10-15. HackRadarBot User-Agent, no login, no cookies._

## Devfolio
- robots.txt: `devfolio.co` and `api.devfolio.co` → `User-agent: * / Disallow:` (allow all).
- Terms (devfolio.co/terms-of-use, effective 29 Dec 2020): nothing on scraping/automated access; only forbids
  interfering with or disrupting the service.
- `GET https://api.devfolio.co/api/hackathons?filter=application_open&page=1` → `{result, count, pages}`;
  **14 open** (1 page). No auth.
- `POST https://api.devfolio.co/api/search/hackathons` `{"type":"application_open","from":0,"size":N}` →
  Elasticsearch-style `hits` (13 total). GET is simpler; use it.
- Fields: `name, slug, starts_at, ends_at, is_online, city, state, country, location, themes, prizes, team_min,
  team_size, participants_count, verified, devfolio_official, hackathon_setting{reg_starts_at, reg_ends_at,
  subdomain, contact_email, …}`.
- **`hackathon_setting.reg_ends_at` = real registration deadline** (Devpost lacks one).
- Trust signals: `verified`, `devfolio_official`, `participants_count`.
- `hackathon_setting.contact_email` is an organiser address → drop it from stored raw JSON.
- Event URL: `https://<subdomain>.devfolio.co/` (to confirm when building).

## MLH
- Listing moved: `https://www.mlh.com/seasons/2027/events` (mlh.io redirects). robots.txt allows `/`
  (blocks /account, /tools, /v4, /auth, /admin, invite paths).
- Terms (www.mlh.com/terms, updated 16 Jun 2021): access "solely for your personal purposes and non-commercial
  use"; no republishing/exploiting content. HackRadar is personal, non-commercial; show only title/date/link.
- Data: page embeds Inertia JSON `<script data-page="app" type="application/json">` →
  `props.upcomingEvents[]` (66): `id, slug, name, status, startsAt, endsAt, dateRange, location, formatType
  (physical | hybrid_physical | …), websiteUrl, region, venueAddress{city,state,country}`.
- **Coverage for India is tiny:** 1 of 66 upcoming (hackCBS 9.0, New Delhi, 31 Oct); 45 US, 13 CA.
  → Low priority; keep it, filter to IN + online/hybrid; cheap to run (one page).

## Geocoding for the place filter (D-034)
- GeoNames `cities15000.zip` (3.4 MB, updated daily, **CC BY 4.0**, attribution required).
  **`download.geonames.org/robots.txt` is `Disallow: /` for all agents** → the pipeline must never fetch it.
  Option: Debjit downloads it once by hand; commit a small derived India-only CSV (name, alt names, lat, lon,
  admin1) with attribution in the repo.
- Alternative: OSM Nominatim (free, no key; usage policy: ≤1 req/s, identify UA, cache results) — **unverified**;
  read the policy before choosing.
- Recommendation: offline GeoNames-derived table (no runtime service, fits ₹0 and "fails independently").
