# HackRadar — Product design

_Date: 2026-10-23 · Status: **approved by Debjit 2026-10-23** · Supersedes nothing; sits above the phase specs._

## 1. Intent

Students and developers waste time checking Devpost, Unstop, Devfolio, MLH and social posts one by one, and
every site shows *everything*. HackRadar fixes that in two ways:

1. **One place, only what you'd enter.** Every morning it gathers events from all sources and picks the
   few that fit *you*: your topics, the prize, online or offline, team or solo, eligibility, **and whether
   you are actually free on those dates.** (Debjit, 2026-10-22/23.)
2. **Your hackathon record, in public.** Everything you save, register for and finish builds a public
   profile: a GitHub-style activity streak and an interest graph that a recruiter can read in a minute
   to see what you are best at. (Debjit, 2026-10-23.)

Part 1 makes people open it daily. Part 2 is the reason to keep using it and to share it.

## 2. Who it is for

- **Users:** students and early developers, India first (Pune and online events), open to anyone (D-044).
- **Recruiters:** read-only visitors who get a profile link. No recruiter accounts in this design.

## 3. Goals

- G1. A morning digest and a "For you" page showing a short ranked list (target 3 to 5), not the full feed.
- G2. Every pick says *why* in one line ("AI + web, online, you're free that weekend").
- G3. From any pick: **Save**, **Register** (opens the organiser's page), **Add to Google Calendar**.
- G4. Saved events get reminders before key dates (7/3/1 days + same day; already decided, D-019).
- G5. Public profile at `/u/<handle>`: activity grid (○ ● ★), counts (registered, submitted, won), interest graph.
- G6. Public leaderboard of people at `/leaderboard`, ranked on verified activity.

## 4. Non-goals (not in this design)

- Teammate finder. Real need, but it is its own product (profiles, matching, messaging, moderation).
  Revisit after the profile exists. Interim: a "looking for team" channel on Discord.
- Recruiter accounts, recruiter search, or contacting users through HackRadar.
- Registering on the user's behalf. "Register" always opens the organiser's own page.
- Reading anyone's private calendar via Google Calendar API (D-032 stays; see §6.2).

## 5. Anti-goals (would be a failure even if it "works")

- A firehose. If the digest regularly shows 15+ items, ranking has failed.
- AI making up dates, prizes or eligibility. These come from source data only (hard constraint).
- Profiles that overstate. Counts on a profile must be honest about where they came from.
- Exposing email, phone or anything beyond what the user chose to show publicly.

## 6. How it works

### 6.1 Ranking ("For you")

Two stages, run in the daily job:

1. **Hard filters (no AI):** place/format, kind, eligibility, invite-only, already dismissed,
   **clashes with a busy period** (§6.2), registration closed.
2. **Cheap match** on interest tags narrows the rest to a shortlist.
3. **AI fit score 0–100 + one-line reason** for the shortlist only, from interest tags (topics, skills,
   prize floor, format, team/solo) and public event text. Users with identical tag sets share one request.
   Stored in the existing `scores` table. (D-051: tags only; never name, email, handle, history or IDs.)
4. **Learns from actions:** saves and registrations pull similar events up; dismissals push them down.

**Eligibility (my call):** structured source fields plus a "Are you a student?" setup question. If AI extracts
eligibility from event text, it is labelled as extracted and the source link is shown.

**Digest (my call):** the 3–5 picks come first in every channel, then an "everything else" link to the full
list on the site. A user with no tags or no matches gets the current unranked digest.

### 6.2 "Am I free?"

**My call, keeping D-032:** users mark **busy periods** in Settings (exam weeks, trips, "weekdays only").
**My call:** an event clashes only if its in-person days or its submission deadline fall in a busy period
(a month-long online event does not clash just by overlapping). Clashing events are greyed with
"clashes with your exams", not hidden. Every saved event is also in
the user's private ICS feed, so their own calendar shows HackRadar events.

Automatic free/busy from Google Calendar is possible later, but needs Google OAuth with a calendar scope
and Google app verification; it would need its own research note and decision.

### 6.3 Acting on a pick

- **Save** → `user_events.status = saved` → reminders start.
- **Register** → opens the source URL, then asks once "Did you register?" → `registered`.
- **Add to Google Calendar** → pre-filled template link (D-032), plus the per-user ICS feed.
- After the event ends, one prompt: "Did you submit? Did you win?" → `submitted` / `done` (+ won flag).
  Optional project link (Devpost/GitHub) as proof.

### 6.4 Public profile (`/u/<handle>`)

- **Public by default** (Debjit, 2026-10-23; D-050). Setup has one checkbox: "I agree to the Terms and confirm
  I'm 18 or older. My profile is public; I can make it private anytime." Existing users see it once.
  The user picks a handle; email is never shown. A short plain Terms page is needed (not legal advice).
- **Activity grid** (Debjit, 2026-10-23), in the fun theme (D-047): every past hackathon in the user's
  interests, by week. Three marks:
  - ○ happened in your interests, you didn't join (**owner view only**)
  - ● you registered / attended
  - ★ you submitted / won
  Clicking a mark shows the hackathon and what you did. **Public and recruiter views show only ● and ★.**
- **Counts:** registered, submitted, won; each tagged *self-reported*, with a ✓ when a project link is given.
- **Interest graph:** a visual network: the user in the middle, topics/skills around them, each hackathon
  linked to its topics. Bigger node = more activity. Built from events the user registered/submitted.
- **My call:** drawn in the browser from Postgres data with a JS graph library. A Neo4j database is not
  needed at this size; "like Neo4j" is taken to mean the look, not the database.

### 6.6 Leaderboard (`/leaderboard`)

Requested by Debjit, 2026-10-23: a leaderboard of people. The rest is **my call**:

- **Points:** registered 1, submitted 3, won 10. Submitted and won count only with a project link (the ✓ from
  §6.4), so a ranking cannot be climbed by typing numbers. Skipped events (○) never count.
- **Boards:** This month (resets, so newcomers can climb) and All time. Filters: by interest (e.g. top AI
  builders) and by city.
- **Who appears:** only users with a public profile and a handle. Private profiles are never listed.
  Each row shows handle, points and counts; clicking opens the public profile (§6.4).
- **Ties:** broken by who reached the score first.
- **Fun theme (D-047):** top 3 get coral/ink/cream "medal" cards; the signed-in user sees "You are #14" pinned.
- **Anti-goal:** a ranking that rewards spam. If many users report the same project link, flag for review.

### 6.7 LinkedIn and X posts (discovery)

Many hackathons are only announced in posts. Already decided (D-002, D-008, D-009); restated here:

- No logins, cookies or direct scraping of LinkedIn or X.
- Search APIs find public posts (Tavily first, then Exa, then Serper). Jina Reader fetches the public page.
- AI extracts name, dates and registration link from the post text. Dropped: no registration link, already
  over, or older than ~90 days (Debjit, 2026-10-15).
- Discovered events join the same dedupe, filters and ranking. The post link is always shown.
- Free limits (Tavily ~1,000 credits/month etc.) need re-checking before building (**unverified** as of 2026-10-23).

## 7. Order of work

| Step | What | Unlocks |
|---|---|---|
| 1 | Ranking + busy periods + "why" line in digest and "For you" page | The core promise |
| 2 | Save / Register / Calendar actions + reminders (Phase 3) | Daily habit |
| 3 | Handle + public profile with streak and counts | Shareable page |
| 4 | Interest graph + recruiter-friendly view | Portfolio value |
| 3b | Leaderboard (§6.6), needs step 3 | Reason to come back and share |
| 5 | LinkedIn / X discovery (§6.5) | Events no other site lists |
| Later | Teammate finder; recruiter search; Google free/busy | Growth |

Each step gets its own short spec and plan before building.

## 8. Constraints that apply

- Existing hard constraints in `CLAUDE.md` (legal sourcing, no personal data to AI, source-only dates/prizes,
  IST, secrets handling).
- Scale (D-044): Gmail SMTP (~500/day) and Vercel Hobby (non-commercial) are fine for friends, not for an
  open launch. Moving email to a transactional provider must be decided before the profile is promoted publicly.
- Data protection: public profiles are personal data. India's DPDP Act 2023 consent rules likely apply
  (**unverified**; research note needed before the profile is promoted publicly). The 18+ checkbox is the
  interim answer (D-050).
- Cost: AI calls scale with distinct tag sets × shortlist, not users × all events (D-051).
- Research 2026-10-23 ([note](../../research/2026-10-23-product-research.md)): DPDP rules for under-18s apply from ~May 2027
  (verifiable parental consent; no behavioural monitoring), so "learns from actions" (§6.1 step 4) must never run for minors.
  Exa has no free API tier now; discovery starts on Tavily's free 1,000 credits/month. Email free tiers run out at a few
  hundred daily users; choose the scale provider before ~400 users.
- Prior art: indiahackathons.com already sends a weekly digest, so a plain digest is not a difference. The difference is the
  "why" line, busy dates, and one profile across every platform.

## 9. How we'll know it works

- Most digests have ≤ 5 picks and users save or open at least one most days.
- Dismiss rate falls over the first weeks (ranking is learning).
- Users share their profile link (count visits to `/u/*` from outside).

## 10. Left to the builder

Score prompt wording, cheap-match method (tag overlap or pgvector), graph library, the exact look of the
three marks, "For you" page layout within the fun theme (D-047), how many picks exactly (3–5), and how
strongly saves/dismissals shift scores.
