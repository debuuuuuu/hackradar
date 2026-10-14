# Devpost API behaviour

- **Date:** 2026-10-14 · **Status:** verified live (robots.txt + 4 API requests)
- **Sources:** https://devpost.com/api/hackathons?status[]=open · https://devpost.com/robots.txt

## Findings
- Default `per_page` is **9** (planning said 40); `per_page=40` is honoured. 48 open hackathons → 2 pages.
- `meta.total_count` gives the total; there is no "next page" link.
- robots.txt: `User-agent: *` with an empty `Disallow` → everything allowed for generic bots.
- Dates are display strings only, in 3 formats (28 × `Mon D - Mon D, YYYY`, 17 × `Mon D - D, YYYY`,
  3 × `Mon D, YYYY - Mon D, YYYY`). No time or timezone.
- Location: `icon` `globe` (36) = online, `map-marker-alt` (12) = in person; `location` is free text.
- Prizes are HTML-wrapped: 41 USD, 6 INR, 1 EUR. `$0` means no cash prize.
- 6 of 48 are invite-only. Many Indian college hackathons are listed (₹ prizes; Gwalior, Jaipur, Bengaluru).
- Response time ~0.4–1 s per page from Pune.

## Implications
- Date handling per D-028. The parser returns None for unknown formats and logs a warning; the event is kept
  without dates rather than dropped.
