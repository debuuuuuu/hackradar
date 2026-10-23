# HackRadar — Feature specs

_Last updated: 2026-10-14_ · Status: **planned**. Each feature lists what a user sees and the rule behind it.

## 1. Daily digest
- Arrives ~5 AM IST (D-018), per user, on each of their chosen channels.
- Sections, in order:
  1. **Top matches** — max 5; each with score, 2-line summary, deadline, link.
  2. **Closing within 3 days.**
  3. **AI picks** — 2–3 with one-line reasons.
  4. **Other options** — compact: title, deadline, link only.
  5. **"Because you saved X"** lines (Phase 4).
- Discord items carry **⭐ Save** and **✖ Not interested** buttons (Phase 3; Phase 1 webhook has no buttons).
- If no new events: a one-line "nothing new" message, so the user knows it ran.
- Phase 1 MVP (built 2026-10-14, D-030): webhook; sections "⏰ Closing within 3 days" and "🆕 New since last run",
  each sorted by joining deadline, max 10 + "…and N more"; no AI, no buttons.

## 1a. Event trust (D-031, built 2026-10-15)
- Each digest line: "by <organiser>", 👥 registrations (when > 0), source name and link.
- Flag line when needed: 💰 `₹200 entry fee` · 🔒 invite-only · ⚠️ no organiser listed · ⚠️ dates look inconsistent.
- Header subtext: dates, prizes and fees are copied from the platform listing; confirm on the event page.
- Flags inform only; nothing is hidden. Rules on source fields only — AI never judges legitimacy.
- Later: "on 2+ platforms" badge (Phase 2, dedupe); ⚠️ unverified for web-discovered events (Phase 4).

## 2. Saves and status
- Status flow: **Saved → Registered → Submitted → Done**, plus **Dismissed**.
- Change from: Discord buttons, `/save`, `/status`, dashboard, email links (signed).
- Dismissed events are hidden from future digests and push similar events down.

## 2a. Calendar (D-032, planned)
- **Add to Google Calendar** link on every event: Discord digest (link button), email, dashboard. Pre-filled
  `calendar.google.com/calendar/render?action=TEMPLATE` URL; no API, no login. Date = joining deadline
  (reg close, else submission); date-only sources → all-day entry. Title, source link, "confirm on the event page".
- **.ics download** for Apple/Outlook (dashboard, email).
- **Personal calendar feed** (Phase 3 with saves): private tokenized URL per user listing saved events' key dates;
  subscribe once in Google Calendar, date changes flow through. Discord `/calendar` returns the URL (ephemeral).
- Not doing: Google Calendar API writes (per-user OAuth + Google app verification for calendar scopes).

## 3. Reminders
- Default offsets 7, 3, 1 days before + same-day morning alert (D-019). Per-user override via
  `/reminders 7,3,1` or dashboard.
- Date reminded depends on status:
  - Saved → registration deadline
  - Registered → start date and submission deadline
  - Submitted → result date, if known
- Buttons: **Mark registered**, **Snooze 1 day** (sets `snoozed_until`).
- Never sent twice: `reminders_sent` keyed by (user, event, date_field, offset_days, channel).
- If a source changes a date (hash change), reminders are recomputed.

## 4. Learning from saves
- Saves boost similar events (embedding similarity); dismissals push similar events down.
- Digest explains with "Because you saved X".
- Fallback when embeddings unavailable: TF-IDF on themes.

## 5. Discord commands
All reply with an ACK within 3 s; slow ones use a deferred response + follow-up (D-020).

| Command | Does |
|---|---|
| `/ask <question>` | Answered from the DB with Groq (small context). E.g. "any web3 hackathons in Pune this month?" |
| `/saved` | Your saved events and their next key dates |
| `/save <event>` / `/status <event> <status>` | Change status |
| `/filters show\|add\|remove` | Manage themes, locations, modes, etc. |
| `/reminders 7,3,1` | Set reminder offsets |
| `/calendar` | Your private calendar-feed URL (ephemeral reply) |
| `/digest now` | Send the latest stored digest |
| `/pause`, `/resume` | Toggle `digest_enabled` |
| `/join` | Onboard a new user |

## 6. Dashboard (React on Vercel, Phase 5)
- Design: direction D "Today" + 5 AM email chosen as the base (2026-10-15), canvas
  https://claude.ai/artifact/SDLHqTM56wgrjpXHTgdbAx (private). Needs polish before build.
- Login: Discord OAuth; each user sees only their own saves and settings.
- Pages:
  - **All events** — search; filter by theme, mode, location, deadline
  - **Saved** — with status controls
  - **Calendar** — deadlines
  - **Settings** — filters, channels, reminder days, CallMeBot phone + key
  - **Admin health** — source status, last runs (owner only)

## 7. Multi-user
- Friends join via `/join` or dashboard login.
- Each user has own filters, scores, saves, reminders, channels.
- AI summarizes each event once; only scoring is per user (D-015).
- Personal data encrypted at rest (D-024); never sent to AI.

## 8. Planned by the product design (2026-10-23)
Full detail: [product design](../superpowers/specs/2026-10-23-hackradar-product-design.md).
- **"For you" picks:** 3–5 ranked picks with a "why" line; only interest tags go to AI (D-051).
- **Busy dates:** user marks exam weeks or trips; clashing events are greyed out.
- **Public profile** `/u/<handle>`: ○ ● ★ activity grid, counts, interest map; Terms + 18+ checkbox (D-050).
- **Leaderboard** `/leaderboard`: points from verified activity (D-052).
- **LinkedIn / X discovery** via search APIs, no logins (D-008).
- Note: the dashboard section above (§6) predates the built site; the live site is described in ARCHITECTURE.md.
