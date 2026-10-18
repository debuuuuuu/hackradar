# Prompt for Antigravity: build the HackRadar "fun theme" into the web app

Copy everything below the line into Antigravity.

---

You are working in the HackRadar repo (a daily hackathon digest: Python pipeline + React/Vite web app in `web/`). Your job: rebuild the **web frontend** in the new "fun theme" exactly as designed, and write a full design doc. Another engineer (Claude) will review and fix your work right after you, so leave the code and notes easy to check.

## 0. Read first

1. `CLAUDE.md` (project rules), then `docs/CONTEXT.md`, then `docs/ARCHITECTURE.md`.
2. The design reference in `design/hackradar-preview/`:
   - `theme.css` — **the source of truth** for tokens, components and motion. Port it, don't reinvent it.
   - One file per screen: `Main.dc.html` (landing), `SignIn.dc.html`, `Phone.dc.html`, `Setup.dc.html`, `Today.dc.html`, `Event.dc.html`, `Saved.dc.html` (My events), `Messages.dc.html` (emails/WhatsApp, spec only).
   - These `.dc.html` files are design prototypes, not app code. How to read them: `{{name}}` is a value from the `renderVals()` method in the `<script>` at the bottom; `<sc-for list="{{items}}" as="x">` is a loop; `<sc-if value="{{flag}}">` is a conditional; `onClick="{{fn}}"` is an event handler; `this.state` / `setState` is component state. Translate each screen into normal React components and hooks. The sample data inside them (event names, prizes, "Debjit") is **fake**; never ship it — use real API data.
3. The existing web code: `web/src/App.tsx`, `web/src/pages/*`, `web/src/components/*`, `web/src/lib/*`, `web/src/styles.css`.

## 1. Hard rules

- **Frontend only.** Change only `web/src/**`, `web/index.html`, `web/public/**`. Do **not** touch `web/server/**`, `web/api/**`, `pipeline/**`, SQL, workflows, or env files. Don't change API request/response shapes, form field names, or the values the forms save (for example the priority values stay `top` / `normal` / `off`; only the visible labels change).
- **Keep every working feature:** email-link sign-in, Google sign-in, Supabase password sign-in, the sign-in confirm page, onboarding redirect, Settings (every field, including Discord webhook + "test" button and CallMeBot key), the public events list with search/filters/paging, the event page with the "Ask an AI" card and prompt preview, and the Admin page.
- **No new npm dependencies** unless something truly can't be done without one (explain it in the doc if so). Fonts load from Google Fonts in `web/index.html`: Young Serif, Gochi Hand, Instrument Sans, DM Mono.
- **Dates and prizes always come from the source data, never from AI.** AI-written summaries stay labelled as AI-written.
- **No personal data in fun copy** except the user's own first name in their own greeting.
- **Accessibility:** real buttons and links, 44px minimum touch targets, visible focus, text contrast 4.5:1, `aria-hidden` on decorative SVGs, and **every animation off under `prefers-reduced-motion: reduce`**.
- **Responsive:** works at 390px wide (no sideways scroll) and at 1440px.
- Work on a new branch `feat/fun-theme`, small conventional commits (`feat:`, `fix:`, `docs:`).

## 2. Design system (port from `theme.css`)

- **Colors:** charcoal `#1f1e1d` page, coal `#161514`, coral `#e5484d` accent (one CSS variable so it can change), cream `#f3e7d7` paper, ink-red `#9b2b2f` lines on paper, ink `#2a1615` text on paper, chalk `#ede6dc` text on dark, mute `#a59d93`.
- **Type:** Young Serif for headings, Gochi Hand for handwritten notes/labels/nav, Instrument Sans for body text, DM Mono for dates/meta.
- **Surfaces:** graph-paper "tablet" card with a thick coral border, cream paper cards, ruled torn notes with tape, polaroids, framed event "shots" that tilt and straighten on hover, notched ticket stubs.
- **Layout:** one shared frame on every page, content max width **1120px**. **No side stamp strips** (they were removed on purpose).
- **Nav (same on every page):**
  - **Signed out:** how it works · browse · your picks · **sign in**.
  - **Signed in:** today · my events · your picks · **sign out**.
  - **Links:** handwritten. Hover draws a hand-drawn loop around the link and shows a small red caption; the current page keeps its loop.
- **Footer (same on every page):** source ticker (Devpost · Unstop · Devfolio · MLH · Luma · LinkedIn and X posts), coral wavy line, brand + one-liner, Explore and Messages link groups, sleeping monitor doodle, base line "Dates and prizes come from the source, never from AI."
- **Logo = the monitor mascot.** A hand-drawn monitor on a stand with a coral-tinted screen and a face. Four faces (sleepy, awake, focused, happy) cycle every ~2 s; it bobs gently; it turns happy and hops on hover of the logo or any nav link. Extra faces used in places: reading, sad, eyes covered by hands. Build it as one reusable `<Monitor mood="..." />` component.
- **Logo speech bubble ("quips"):**
  - **What:** a small cream bubble under the logo showing a random short line (jokes plus questions like "Pikachu or Charmander? Think fast."). There are no answer buttons, and never the same line twice in a row.
  - **When:** shown for ~4.5 s, then a random gap of **30–90 s**. Hovering the logo shows one immediately. Paused while the tab is hidden.
  - **Courtesy:** the bubble must not block clicks.
  - **Lines:** come from a static list in one file for now, with a `// TODO(backend): replace with daily AI-generated lines` comment. The real lines will later be generated by the daily pipeline's LLM; that's backend work, so do not build it.
  - **Markup:** the bubble element only exists while it is showing.
- **Mini icons ("our emoji"):** small hand-drawn line icons (pin, bulb, code, sparkle, clock, wifi, heart, cup, rocket, trophy, people, ticket, monitor faces) used inline in copy and tags. One `Icon` component with a name prop. Where only plain text works (WhatsApp, email subjects), use the monitor text faces `[^‿^]`, `[o_o]`, `[^o^]`, `[-_-]zz`.
- **Motion:**
  - **Hero:** the hero card rises in, and doodles draw themselves (stroke-dashoffset).
  - **Radar:** the radar sweeps.
  - **Scroll:** event cards drop in on scroll, notes fly in, and on the landing the sheet slides over the hero (sticky).
  - **Interactions:** the checklist ticks and strikes through, buttons lift, the ticker scrolls and pauses on hover.
  - All of it is disabled with reduced motion.

## 3. Screens and flow (design board → real route)

The user flow: **landing → sign in → (phone, optional) → setup → Today → event page**, plus **My events** and **Settings**, with messages arriving each morning.

1. **Landing — `/` signed out** (`Home` → `Landing` + public list). Sections:
   - **Hero:** headline with the rotating handwritten ending (near you. / worth your weekend. / you'd actually want.) and the radar screen.
   - **"How it works":** sheet with four torn notes and a polaroid of a LinkedIn/X find marked unverified.
   - **"Open right now":** blueprint board of event shots using **real** `/api/events` data (first 6).
   - **"Tell us what you like":** checklist that fills a drawing as you tick, with the button going to sign in.
   - **"What lands each morning":** sample message.
   - Footer.
2. **Sign in — `/signin`, `/signin/confirm`:**
   - **Header:** "Hey, builder." with 3 progress dots.
   - **Methods:** Google first, then a wavy "or" divider with a spinning stamp, then tabs Magic link / Password. Only show methods the server reports as enabled (`/api/auth/providers`).
   - **Mascot reactions:** happy on Google hover, reading while the email field is focused, hands over its eyes while the password field is focused, each with a speech line.
3. **Phone (optional) — new step after first sign-in, before setup:**
   - **What it does:** WhatsApp number, CallMeBot key help, "Skip for now". The mascot counts down digits; at 10 the phone doodle buzzes; hovering Skip makes it sad.
   - **Saving:** only build this as a separate route if `/api/me/prefs` accepts saving just these fields. Check the server code but don't change it. Otherwise keep the phone fields inside Setup section 1 and note that in the doc.
4. **Setup / Settings — `/welcome` and `/settings` (`PrefsForm`):**
   - **Sections:** four playful titles: Where should we ping you? / Where's home base? / What gets you out of bed on a weekend? / How loud should we be?
   - **Priority labels:** "ping me! / digest / nah", which still map to top/normal/off.
   - **Distance:** the "vibe" text changes as you slide (auto-rickshaw range … anywhere in India).
   - **Mascot:** a speech bubble that reacts to the choices.
   - **Keep:** every existing field and behaviour.
5. **Today — `/` signed in:**
   - **Header:** greeting "Morning, {first name}." with the mascot, and the picks summary line with an edit link.
   - **Top picks:** cards with styled tags: topic (coral + bulb), distance (pin), online (wifi), on N sites (dark + sparkle), closes soon (wobbly sticker + clock). Max 3 tags, else 2 + "+N". Show 3 cards, then "Show N more picks".
   - **LinkedIn/X finds:** polaroids marked unverified.
   - **"Also open near you":** list with sort chips Closing soon / Nearest, grouped into Closing this week / This month / Later, showing 5 rows then "Show N more". Rows use aligned columns.
   - **Rules:** derive tags only from fields the API actually returns; don't invent data. Keep server-side paging for long lists.
   - **Save buttons:** there is no saved-events backend, so either hide them or render them disabled with a `TODO(backend)`. Say which in the doc.
6. **Event page — `/events/:id`:**
   - **Layout:** graph-paper tablet with the poster plus a monitor sticker, a date timeline with a countdown sticker computed from real dates, and the facts as a notched ticket stub with icons.
   - **AI summary:** labelled "written by AI from the public listing (dates aren't)".
   - **Ask an AI:** Ask ChatGPT / Ask Claude / Copy prompt with the "See exactly what is sent" preview, using the existing prompt logic unchanged.
7. **My events — new route `/my-events`, signed in only:**
   - **What it shows:** tabs Coming up / Went to, a timeline with reminder chips, a "Did you go?" card, and a polaroid scrapbook.
   - **No backend yet:** build the page shell with a friendly empty state ("Saving events is coming soon") plus `TODO(backend)` notes. Don't fake data.
8. **Messages (`Messages.dc.html`) — not a web page.** Emails and WhatsApp are backend (`web/server/mail.ts`, pipeline). **Do not change them.** Describe them in the design doc as the spec for a later pass. Real emails need email-safe HTML and PNG icons.
9. **Admin — `/admin`:** restyle with the new tokens only; no layout changes needed.

## 4. Checks before you finish

- `cd web && npm run build` passes (TypeScript + Vite).
- `cd web && npx vitest run` passes. DB tests may be skipped without `TEST_DATABASE_URL`. Update UI tests only if markup changed, never by weakening what they check.
- Open the app with `npm run dev` and check every route at 1440px and 390px, with and without reduced motion, signed in and signed out. Take screenshots into `docs/design/screens/` if you can.
- `grep` for leftover sample data ("Debjit", "Pune AI Build Weekend", "₹1,50,000") in `web/src`: there must be none, except the user's real name coming from the API.

## 5. Docs you must write or update (same branch)

1. **Create `docs/design/DESIGN.md`**, the single design reference, with these sections:
   - **Purpose:** one line.
   - **Tokens:** colors with hex values and usage, type scale, spacing, radii.
   - **Components:** every component with its props, states and where it's used: Monitor and moods, quip bubble, nav, footer, tablet card, shot card, polaroid, torn note, ticket, tag kinds, chips, segmented control, switch, matrix cell, buttons, Icon set.
   - **Motion:** every animation, its trigger, duration, and reduced-motion behaviour.
   - **Copy and tone:** voice rules, mascot lines, text faces.
   - **User flow:** a mermaid diagram from landing to Today/event/My events, plus each route and what it needs from the API.
   - **Screen-by-screen notes:** for each route, what was built, with any deviation from the design and why.
   - **Needs backend:** saved events and reminders, "went to" history, AI-generated quip lines, phone-only save if not possible, email/WhatsApp redesign. For each: what the UI expects and the suggested API shape.
   - **How to change the theme:** for example the accent color variable.
2. **Append decision `D-047` to `docs/DECISIONS.md`** in the existing format: the web theme is a dark charcoal + coral + cream hand-drawn style with the monitor mascot logo, frontend only, the reference is `design/hackradar-preview/`, and the side stamp strips were rejected.
3. **Update `docs/CONTEXT.md`:** add the design doc to the doc index and update "Resume here".
4. **Write a session note** at `docs/sessions/YYYY-MM-DD-fun-theme.md`: goal, done, files changed, problems, next steps.
5. **Update `docs/ARCHITECTURE.md`** only if the frontend structure changed (new components/routes).

## 6. Hand-off report (end of your run)

Finish with a short report:
- the branch and commits
- the files changed
- what matches the design and what doesn't (with reasons)
- every `TODO(backend)`
- test and build results, with the commands you ran
- anything you weren't sure about

Claude will use this report to review and fix the work next, so be specific and honest. Don't claim something works unless you ran it.
