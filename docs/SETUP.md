# HackRadar — One-time setup

_Last updated: 2026-10-14_ · ~30 minutes total. Every service is free with **no credit card**.
If any signup asks for a card, stop and log it in `docs/research/`.

**Where secrets go:** GitHub → repo → Settings → Secrets and variables → Actions (pipeline);
Vercel → project → Settings → Environment Variables (bot + dashboard); local `.env` (gitignored).
Never commit a secret. `.env.example` lists names only.

Do steps in the phase they are needed — no need to set everything up on day one.

| # | Service | Needed in phase | Secret name(s) | GitHub | Vercel | .env |
|---|---|---|---|---|---|---|
| 1 | GitHub repo | 0 | — | — | — | — |
| 2 | Neon Postgres | 0 | `DATABASE_URL` | ✓ | ✓ | ✓ |
| 3 | Discord webhook | 1 | `DISCORD_WEBHOOK_URL` | ✓ | | ✓ |
| 4 | Gemini (optional, D-035) | 2 | `GEMINI_API_KEY` | ✓ | ✓ | ✓ |
| 5 | Groq (main AI, D-035) | 2 | `GROQ_API_KEY` | ✓ | ✓ | ✓ |
| 6 | Gmail App Password | 2 | `SMTP_USER`, `SMTP_APP_PASSWORD` | ✓ | | ✓ |
| 7 | Discord application/bot | 3 | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID` | ✓ | ✓ | ✓ |
| 8 | Encryption key | 3 | `ENCRYPTION_KEY` | ✓ | ✓ | ✓ |
| 9 | CallMeBot | 3 | per-user, stored encrypted in DB (owner's test key in `.env` only) | | | ✓ |
| 10 | Vercel project | 3 | — | — | — | — |
| 11 | Tavily | 4 | `TAVILY_API_KEY` | ✓ | | ✓ |
| 12 | Serper (fallback) | 4 | `SERPER_API_KEY` | ✓ | | ✓ |
| 13 | Discord OAuth | 5 | `DISCORD_CLIENT_SECRET` | | ✓ | ✓ |

## 1. GitHub repo (Phase 0)
> ✅ Done 2026-10-14: https://github.com/debuuuuuu/hackradar (public), workflow permissions set to read/write.
1. Create a **public** repo named `hackradar` (D-017). No template, no README (we push ours).
2. `git remote add origin https://github.com/<you>/hackradar.git` and push `main`.
3. Settings → Actions → General → Workflow permissions → **Read and write** (needed for the keepalive commit).

## 2. Neon Postgres (Phase 0)
> ✅ Done 2026-10-14 via Neon MCP: project `hackradar` (`proud-bar-84693777`), Singapore, db `hackradar`. `DATABASE_URL` is in `.env` and GitHub Secrets.
1. Sign up at https://neon.tech (GitHub login is fine).
2. Create project `hackradar`, region closest to India (e.g. AWS Singapore `ap-southeast-1`; unverified availability).
3. Dashboard → Connect → copy the **pooled** connection string → `DATABASE_URL`.

## 3. Discord webhook (Phase 1)
1. In your Discord server: channel settings → Integrations → Webhooks → New Webhook.
2. Copy the URL → `DISCORD_WEBHOOK_URL`.

## 4. Gemini API key (Phase 2)
1. https://aistudio.google.com → Get API key → Create.
2. → `GEMINI_API_KEY`. Free tier: Google may use data for training — only public event text is sent (D-006).

## 5. Groq API key (Phase 2)
1. https://console.groq.com → API Keys → Create.
2. → `GROQ_API_KEY`.

## 6. Gmail App Password (Phase 2)
1. Google Account → Security → turn on **2-Step Verification**.
2. Security → App passwords → create one named "HackRadar".
3. Gmail address → `SMTP_USER`; 16-char password → `SMTP_APP_PASSWORD`.

## 7. Discord application + bot (Phase 3)
1. https://discord.com/developers/applications → New Application "HackRadar".
2. General Information: copy **Application ID** → `DISCORD_APP_ID`, **Public Key** → `DISCORD_PUBLIC_KEY`.
3. Bot → Reset Token → `DISCORD_BOT_TOKEN`.
4. OAuth2 → URL Generator: scopes `bot`, `applications.commands`; permissions Send Messages, Embed Links → open URL → invite to your server.
5. After Vercel deploy (step 10): General Information → **Interactions Endpoint URL** = `https://<vercel-app>/api/interactions`.

## 8. Encryption key (Phase 3)
1. Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   (AES-256-GCM, D-039/D-024; must decode to exactly 32 bytes). Fernet was dropped.
2. → `ENCRYPTION_KEY`, in GitHub Actions and Vercel with the same value. A mismatch makes every user's contacts unreadable. Losing it means re-collecting CallMeBot keys and webhooks; keep a private backup.

## 9. CallMeBot (Phase 3, per user)
1. Each user saves CallMeBot's number in contacts and sends the permission message on WhatsApp
   (exact number and message: see https://www.callmebot.com — check current instructions).
2. They receive an API key; they enter phone + key via `/join` or the dashboard Settings page. Stored encrypted.

## 10. Vercel project (Phase 3)
1. https://vercel.com → sign up with GitHub (Hobby, no card).
2. Import the `hackradar` repo. Configure the Python function and `web/` build (details written in Phase 3).
3. Add env vars from the table.

## 11. Tavily (Phase 4)
1. https://tavily.com → sign up → API key → `TAVILY_API_KEY`.

## 12. Serper (Phase 4, fallback)
1. https://serper.dev → sign up → API key → `SERPER_API_KEY`. One-time 2,500 credits; don't burn them in testing.

## 12b. Google sign-in (D-045)
Free, no card. Console labels may differ slightly (unverified, as of 2026-10-16); the idea is the same.
1. https://console.cloud.google.com → create a project (for example `hackradar`).
2. APIs and Services → OAuth consent screen → External → app name HackRadar, your support email. Scopes: `openid`, `email`, `profile` only.
3. Set the publishing status to **In production**. Left on Testing, only listed test users can sign in. These basic scopes need no Google review.
4. Credentials → Create credentials → OAuth client ID → Web application. Authorised redirect URI: `https://hackradar-two.vercel.app/api/auth/google/callback` (add your own domain later).
5. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then add both to Vercel (Production) and redeploy.
6. Run `pipeline/migrations/0010_login_google.sql` on the live database BEFORE deploying, or Google logins fail to record.

## 12c. Supabase Auth for passwords (D-046)
Free project, but **stop if it asks for a credit card** (project rule). Dashboard labels may differ (unverified, as of 2026-10-16).
1. https://supabase.com → New project (pick the Singapore region). It is used for sign-in only; the database stays on Neon.
2. SQL editor → run this once, so the daily keep-alive has a real table to query:
   ```sql
   create table public.keepalive (id int primary key);
   insert into public.keepalive values (1);
   alter table public.keepalive enable row level security;
   create policy "keepalive read" on public.keepalive for select to anon using (true);
   ```
3. Authentication → Providers → Email: on, "Confirm email" on. Password minimum length 8 or more.
4. Authentication → URL configuration: Site URL `https://hackradar-two.vercel.app`; add redirect URL `https://hackradar-two.vercel.app/signin`.
5. Project settings → API: copy the Project URL and the anon public key into `.env` as `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon key is public by design; never use the service_role key anywhere here).
6. Add both to Vercel (Production) and GitHub secrets, then redeploy. The daily workflow then runs the keep-alive query.
7. Email sending: Supabase's built-in mail is for testing and rate-limited (unverified). For real use set custom SMTP (Authentication → SMTP) with the same Gmail app password until a transactional provider replaces it.
8. Before public launch move the project to Pro so it can never pause.

## 13. Discord OAuth for dashboard (Phase 5)
1. Developer portal → OAuth2 → add redirect `https://<vercel-app>/auth/callback`.
2. Client Secret → `DISCORD_CLIENT_SECRET` (Vercel only).
