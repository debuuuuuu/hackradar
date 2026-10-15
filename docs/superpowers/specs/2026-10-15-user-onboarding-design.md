# Users pick what they want: onboarding, preferences, per-user messages

_Status: draft awaiting Debjit's approval of this document (2026-10-15). Nothing here is built. Mockups: `.superpowers/brainstorm/40-1792035699/content/` (`onboarding-flow-v3.html`, `ask-ai-event-card.html`, local only, gitignored); dashboard look: the Direction D canvas in `docs/CONTEXT.md`._

## Intent

HackRadar should let anyone (Debjit's friends, college peers) join and say what they care about, then message them only about that. Two things set it apart from listing sites:

1. **It finds events on LinkedIn and X** (public posts through search, no logins) that no listing site has. Debjit calls this the main feature.
2. **The website shows everything; notifications cover only what each person picked.**

It is also for **events in general, not only hackathons**: contests, workshops and meetups, fests and conferences.

## What Debjit decided (his words, mockups approved)

- First ask for **email, phone number and a Discord join**. All optional; each is needed only for notifications on that channel.
- Ask for a **preferred location**; it can be changed later on the website.
- Ask **what kinds of events and notifications** they want, and a **priority** for each kind (mockup: Top / Normal / Off).
- Then **send messages (email etc.) according to those answers**.
- Each event gets a **summary people can use with their favourite chatbot**. Decided: **links that open ChatGPT or Claude with the event context prefilled**, plus a "Copy prompt" fallback. Gemini is not included.
- The website lists all events regardless of preferences.

## Goals

- A new person is set up in about two minutes and can skip any step.
- Every notification a person receives matches their picks (kinds, topics, place, channels).
- An event page with "Ask ChatGPT / Ask Claude / Copy prompt" and a visible preview of exactly what is sent.
- Cost stays at Rs 0, free tiers only, no card (project constraint).

## Non-goals

- Real-time alerts (the pipeline runs once a day).
- Paid plans, a mobile app, Gemini/other chatbot links.
- Logged-in scraping of any site.

## Anti-goals (a failure even if it technically works)

- Messaging someone about something they set to Off, or on a channel they did not enable.
- Hiding an event from the website because of notification preferences.
- Sending any personal data (email, phone, name, picks) to an AI provider. Only public event text goes to AI (project rule).
- Presenting a LinkedIn/X-discovered post as confirmed. It carries an "unverified" mark and the source link (existing rule).
- Letting untrusted event text act as instructions inside the user's chatbot (see "Ask an AI" below).

## Constraints already fixed by the project

- Neon Postgres already has `users` and `preferences` tables (extend them); email and phone are **encrypted at rest** (D-024).
- Web: Vercel Hobby (D-010), React/Vite, in the Direction D look. Discord bot via interactions endpoint (D-011). Email via Gmail SMTP (D-012). WhatsApp via CallMeBot (D-013).
- Dates, prizes and fees come from source data, never from AI (D-014). Place filter uses `config/places.yaml` (D-038).
- Roadmap today puts the bot in Phase 3 and the dashboard in Phase 5; this work pulls parts of both forward.

## Design

### Preferences a person sets
| Setting | Values | Notes |
|---|---|---|
| Channels they gave | email, WhatsApp number, Discord | all optional |
| Home city, distance, format | as the place filter (D-038) | changeable later |
| Priority per **event kind** | Top / Normal / Off | kinds: hackathons, coding contests and CTFs, workshops and meetups, fests and conferences |
| Topics | AI/ML, Web3, Web/full-stack, Data, IoT/hardware, Cybersecurity, Design, Beginner friendly | multi-select |
| Include LinkedIn/X finds | yes / no | yes by default |
| Channel per message type | daily digest, Top pings, reminders for saved events | each over email / Discord / WhatsApp |

Meaning of priority: **Top** = messaged on the next daily run with its own message; **Normal** = included in the daily digest; **Off** = never messaged, still visible on the site. An event matches a person when its kind is not Off, it passes their place filter, and (if they chose topics) it shares a topic.

### Pages (mockups exist)
- **Onboarding** (four steps: reach you, where you are, what you follow, how we message you). Also reachable later as Settings.
- **Event page** with key dates, source link, Save, and the "Ask an AI about this event" card.

### "Ask an AI about this event"
- Buttons: `https://chatgpt.com/?q=<encoded prompt>`, `https://claude.ai/new?q=<encoded prompt>`, and Copy prompt.
- **Unverified:** neither prefill format is officially documented (research note `docs/research/2026-10-15-ai-chat-prefill-links.md`). Test both by hand first. Keep Copy prompt as the working fallback.
- Prompt = fixed instruction + event facts (title, kind, place, source dates, team size, fee/prize or "not listed", link, our AI summary), wrapped in markers that say it is information, not instructions. Keep the whole URL under about 2,000 characters. No user data.
- The page shows the prompt in a collapsible preview so people see what leaves the site.

### Sending
- The daily GitHub Actions run builds one message set **per person** from their preferences and sends each over the channels they chose. The shared Discord webhook digest stays until the bot exists.

## My calls (Debjit has not decided these; change any)

1. **Top/Normal/Off** as the priority scale (taken from the approved mockup).
2. **Top pings go out in the daily run (about 5 AM), not instantly.** The mockup copy "as soon as it appears" must change to "in the next morning's run". A second, mid-day cron is possible later.
3. **Topics** come from a fixed list. AI tags each event with topics from that list at enrichment time (public text only), since source themes are free text and inconsistent.
4. **Event kind** extends the current AI `kind` (hackathon / contest / other) to the four kinds above. Until Luma (D-033) and LinkedIn/X discovery (Phase 4) exist, "workshops and meetups" and "fests and conferences" will have few or no events; the page should say so rather than look broken.
5. **WhatsApp via CallMeBot needs a per-person key** (they message the CallMeBot bot from their own phone to get it). The mockup only asks for a number; the real form must also explain and collect the key, and say it is optional.
6. **Per-person Discord messages need the Discord bot** (Phase 3 work); the current webhook can only post to one shared channel.
7. Build order (builder may adjust): (a) schema + per-person filtering in the digest builder, tested; (b) event page "Ask an AI" card, which needs no accounts; (c) onboarding/Settings pages with sign-in; (d) per-person delivery over email, Discord bot, WhatsApp; (e) LinkedIn/X discovery (Phase 4 as planned).

## Decided: sign-in

**Sign in with Discord, or with a one-time link sent by email. No passwords.** (Debjit, 2026-10-15.) A person with neither can still browse the whole site but cannot save picks. The sign-in identity (Discord ID or email) is the account; the optional "where to reach you" fields in onboarding are separate notification channels and may differ from it. Free tiers only: Discord OAuth is free; the email link goes through Gmail SMTP (needs the Gmail app password, still pending).

## Left to the builder

- Exact schema columns and migration, encryption mechanics (D-024), the topic-tagging prompt, URL building and length trimming, page routing and styling details, and tests (fixture-based for any scraper; DB tests use the throwaway-schema fixture).
