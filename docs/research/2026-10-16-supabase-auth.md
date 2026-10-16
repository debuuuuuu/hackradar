# Supabase Auth for email + password sign-in (2026-10-16)

Why: Debjit wants email and password sign-in alongside the email link and Google, at a target of 1,000 to 1M users (D-044). Rolling our own passwords means hashing, reset, lockout and breach risk. Supabase Auth provides them.

## Findings (as of 2026-10-16)

- **Free plan:** 50,000 monthly active users, 500 MB database, 2 active projects. Pro: from $25/month, 100,000 MAU, then $0.00325 per extra MAU. Source: https://supabase.com/pricing (via search summary; **unverified on the live page**).
- **Pausing:** free projects pause after about 1 week of low database activity. "A few user requests to the database each day" over the past week is enough to avoid it. Paid projects are never paused. Source: https://supabase.com/docs/guides/platform/free-project-pausing
- **Restore window after a pause:** the current page says up to 90 days; older copies said one year. Treat 90 days as likely.
- **Keep-alive:** community guides use a daily scheduled request. Supabase's own position on automated keep-alive is **unverified**.
- **Credit card:** not confirmed for the free plan. **Unverified.** Debjit must check at sign-up and stop if a card is requested (project rule).
- **Email sending:** Supabase's built-in mail service is intended for testing and rate-limited (**unverified in this session**). Real volume needs custom SMTP, which today means Gmail (about 500/day) until a transactional provider is chosen.
- **Email and password on the free plan:** reported as included, **unverified** in Supabase's own docs.

## How we use it

- Supabase handles only: create account, confirm email, sign in with password, reset password.
- Our own session stays. After Supabase signs a person in, the browser sends its access token to `POST /api/auth/supabase/session`. The server asks Supabase `GET /auth/v1/user` to validate it (no JWT secret in our code), requires a confirmed email, then finds or creates our user by email hash and sets our `hr_session` cookie. Everything else (preferences, digests, admin) is unchanged.
- One account per email: email link, Google and password all land on the same user.
- Supabase stores the password hash and email. We store no password. Email-link and Google paths stay on our code.

## Keep-alive

A `keepalive` table in Supabase (public, read policy for the anon role) and a daily step in `daily.yml` that runs `GET {SUPABASE_URL}/rest/v1/keepalive?select=id&limit=1` with the anon key. That is a real database query, once a day. GitHub secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Open

- Whether Supabase asks for a card; the real limits of its default email; MAU billing at scale; whether to move to Pro at public launch (recommended, D-046).
