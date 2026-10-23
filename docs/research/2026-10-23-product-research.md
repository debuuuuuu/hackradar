# Product research: competitors, privacy law, free limits (as of 2026-10-23)

Research for the [product design](../superpowers/specs/2026-10-23-hackradar-product-design.md). Web searches on 2026-10-23.
Many sources are secondary (blogs, comparison sites); each item says so. Nothing here is legal advice.

## 1. Competitors: is "personal picks + busy dates + profile" already done?

| Product | What it does | Personal picks? | Busy dates? | Profile / leaderboard? |
|---|---|---|---|---|
| [Unstop](https://unstop.com/hackathons) | 2,500+ India listings, hiring platform (~7M students per [Dealroom](https://app.dealroom.co/companies/unstop)) | Not found | No | Per-event leaderboards for organisers ([SIR MVIT report](https://www.sirmvit.edu/wp-content/uploads/2022/09/hackathon-report.pdf)); platform-wide ranking **unverified** |
| [indiahackathons.com](https://indiahackathons.com/) | Aggregates Luma, Eventbrite, Meetup, Devpost; city/date/topic filters; **weekly email digest**; free, paid "featured" pins | No | No | No |
| [Reskilll](https://reskilll.com/allhacks) | India listings, theme/format/date filters, student filter | No | No | No |
| [QWAD](https://qwad.in/blog/top-hackathons-india-2026) | "Campus operating system": events, hackathons, **teammates** | **Unverified** | **Unverified** | **Unverified** |
| Devpost / [Devfolio](https://guide.devfolio.co/docs/guide/Projects) | Project portfolios on their own platform | No | No | Portfolio of projects **on that platform only** |

**Finding:** listings, filters and digests are common (indiahackathons.com already sends a weekly digest). Nothing found does
**personal ranking with a reason**, **busy-date filtering**, or a **cross-platform** profile and leaderboard. Searches can miss
products, so treat "nobody does it" as **unverified**. The strongest differences are therefore the "why" line, busy dates, and the
profile that combines every platform. A plain aggregator would not stand out.

## 2. India DPDP Act and minors

- Under the DPDP Act 2023 a **child is under 18**. Processing a child's data needs **verifiable parental consent**, and tracking,
  behavioural monitoring and targeted ads aimed at children are not allowed (Section 9, Rule 10). Penalty up to ₹200 crore.
  Sources: [Veritect playbook](https://veritect.ai/digital-data-ai-law/dpdp-childrens-data-compliance-playbook),
  [ORF](https://www.orfonline.org/expert-speak/dpdp-rules-and-the-future-of-child-data-safety).
- **When:** Rule 10 applies from about **13–14 May 2027** (18 months after the Rules were notified); consent-manager rules come
  around Nov 2026. A shorter timeline was mentioned as possible. Sources: [dcomply rules tracker](https://dpdpa.dcomply.in/rules/),
  [TCSA roadmap](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap). Primary text: Gazette G.S.R. 846(E)
  (not read directly; **unverified**).
- **What it means for us:** the 18+ checkbox (D-050) is a reasonable interim step. "Learns from what you save" is behavioural
  monitoring, so it must not run for under-18s. Before May 2027 we need either a real way to keep minors out, or parental
  consent. A public launch to college students (many 17–18) makes this real. Needs a proper legal check before promotion.

## 3. Supabase free plan pausing

- Official: free projects are paused after **7 days of low activity**; a few database requests a day prevent it; warning email
  about a week before; restorable for 90 days. Source: [Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing).
- **Confirms the risk found today:** the daily keep-alive step is skipped because `SUPABASE_URL`/`SUPABASE_ANON_KEY` are not
  GitHub secrets. Password sign-in breaks if the project pauses.

## 4. Search APIs for LinkedIn/X discovery

- **Tavily:** **1,000 credits/month free, no card**; resets on the 1st; basic search = 1 credit, advanced = 2. Paid from $30/mo
  for 4,000. Source: [Tavily docs](https://docs.tavily.com/documentation/api-credits.md). ~10 basic searches/day ≈ 300/month: fits.
- **Exa:** official changelog shows **no API free tier**; "search with contents" **$7 per 1,000** (2026-03-03), Lite search
  $4 per 1,000 (2026-10-19). An unauthenticated MCP endpoint allows 3 QPS and 150 calls/day (2026-02-02). Source:
  [Exa pricing update](https://exa.ai/docs/changelog/pricing-update). Secondary sites still claim a free tier; **conflicting**.
  **Change from 2026-10-14 note:** "Exa (no key)" as the free backup is no longer safe to assume; using the MCP endpoint from a
  server may break their terms (**unverified**).

## 5. Email at scale (D-044 follow-up)

Gmail SMTP sends ~500/day (2026-10-14 note). Free tiers elsewhere, from **secondary** comparisons
([Dupple](https://dupple.com/learn/best-transactional-email-services), [Dreamlit](https://dreamlit.ai/blog/best-sendgrid-alternatives)):

| Provider | Free | After |
|---|---|---|
| Resend | 3,000/month, **100/day** cap | ~$20/mo for 50,000 |
| Brevo | ~**300/day** | paid plans |
| Amazon SES | 3,000/month for the first year only; new accounts sandboxed (200/day, verified recipients) | **$0.10 per 1,000** |
| SendGrid | free plan gone (60-day trial) | — |

**What it means:** one digest per user per day means free tiers run out at a few hundred users. Gmail (500/day) is currently the
biggest free option. Past ~400 daily users, the cheapest path is Amazon SES (₹~10 per 1,000 emails), which needs a card and a
domain. Decide before opening sign-ups widely. Figures **unverified** against official pricing pages.

## 6. Google Calendar free/busy (later option)

- Scope `calendar.freebusy` only shows **availability**, not event details. Source:
  [Google Calendar API auth](https://developers.google.com/calendar/api/auth).
- Public apps using calendar scopes need Google's OAuth verification; the page does not say whether `calendar.freebusy` is
  "sensitive". **Unverified.** Manual busy dates (§6.2 of the design) avoid this entirely.

## Actions suggested

1. Add the Supabase secrets to GitHub (protects password sign-in). Needs Debjit's OK.
2. Product design: keep busy dates, the "why" line and the cross-platform profile as the core; note indiahackathons.com as
   prior art for the digest.
3. Don't run "learning from saves" for anyone under 18; plan a minors approach before May 2027.
4. Discovery: Tavily free is enough to start; drop the assumption that Exa is free.
5. Pick the email provider for scale before the user count passes ~400.
