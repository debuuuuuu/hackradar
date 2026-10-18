# 2026-10-18 · Accounts, unsubscribe, HTML emails, email digests live

**Goal:** make sign-in, sign-out and account creation solid, and get the email channel working like Discord so friends can test it on 19 Oct.

## Done
- Checked every sign-in path: all need a verified email (email link, Supabase password, Google). Supabase "Confirm email" is on (`mailer_autoconfirm: false`, checked 2026-10-18). Tests added for the unconfirmed case.
- Neon was missing migrations 0009 and 0010, which broke the email-link sign-in ("could not send the email"). Applied 0009, 0010, 0011 and 0012.
- Name: asked on the sign-in form, carried on the one-time token (`login_tokens.name`), stored on the new account. `PUT /api/me/name` and a Settings card change it later. Setup is no longer forced: the link lands on the main page with a "Finish setup" banner.
- Unsubscribe: signed link in the welcome and digest emails; confirm page; the button deletes the account (D-049).
- Emails in the `design/hackradar-preview/Messages.dc.html` look: welcome, sign-in link, morning digest (HTML + text, `List-Unsubscribe`), with the site mascot (`web/public/email/`).
- Pipeline now sends email to users with a verified sign-in address (`email_hash` set). `daily.yml` passes `SMTP_USER` and `SMTP_APP_PASSWORD`.
- Merged PR #4 to `main`. First live email digests sent 2026-10-18 10:12 UTC (run 39118287432): 2 sent, 0 failed.
- Vercel: project Root Directory set to `web`; GitHub pushes now deploy. Supabase variables added to Vercel production.

## Files changed
`web/server/{auth,auth-routes,mail,unsubscribe}.ts`, `web/src/pages/{SignIn,Home,ConfirmSignIn,Onboarding,Settings,Unsubscribe}.tsx`, `web/src/components/NameForm.tsx`, `pipeline/notify/{email,unsubscribe}.py`, `pipeline/{run,user_digest}.py`, `pipeline/migrations/0011..0012`, `pipeline/models.sql`, `.github/workflows/daily.yml`, tests, `docs/specs/auth.md`.

## Decisions
D-049 (unsubscribe deletes the account; HTML emails; name step).

## Findings
- GitHub-triggered Vercel builds failed with `vite: command not found` until Root Directory was `web` ([research](research/2026-10-18-vercel-deploy.md)).
- Web DB tests time out from a laptop against Neon (30 s each, remote latency). CI, with a local Postgres, passes them.

## Problems and open items
- The unsubscribe link has no expiry; anyone with the email can delete that account.
- Handwritten fonts, sticker and sunrise banner from the design are not in the emails (no web fonts in mail clients; images not made).
- Digest has no "joke of the day" or top-pick stamp (no AI ranking in the digest yet).
- Deleting an account does not delete the Supabase Auth record.
- Google sign-in keys are not set on Vercel.
- Discord-only accounts have no verified email, so they get no email digest.
- Neon branch `test` is the user's own test database (created 2026-10-15); not for deletion.

## Next steps
1. Read the 19 Oct 5 AM IST cron run: `sends` should show email `sent` for friends who finished setup.
2. Collect friends' feedback on the emails and sign-in.
3. Decide on expiry for unsubscribe links and on digest extras (top pick, joke).
