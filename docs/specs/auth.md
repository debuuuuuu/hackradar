# Sign-up, sign-in and sessions

_Written 2026-10-18 from the code in `web/server` (auth.ts, auth-routes.ts, session.ts, supabase.ts, google.ts). Decisions: D-044, D-045, D-046, D-048._

## Rules
- No separate "create account" step. The first successful sign-in creates the account and its default preferences in one statement.
- One account per email address, whichever method is used. Lookup is by `users.email_hash`; the address itself is stored encrypted.
- Browsing is public. Sign-in is needed only for picks, digests and My events (D-045).

## Sign-in methods
| Method | Flow | Records login as |
|---|---|---|
| Google | `/api/auth/google/start` → Google → `/callback` → session cookie | `google` |
| Email link | `/api/auth/email/start` sends a one-time link; opening it shows a confirm page (scanners prefetch links); `POST /email/verify` consumes it | `email` |
| Email + password | Browser talks to Supabase Auth (confirm, reset). It then posts the access token to `/api/auth/supabase/session`; the server asks Supabase to verify it | `email` |
| Discord | Built, off at launch | `discord` |

## Session
- Cookie `hr_session`: HMAC-signed `{uid, iat, exp}`, HttpOnly, Secure, SameSite=Lax, 30 days.
- Every protected route calls `findUser(uid, iat)`. It refuses the cookie when the user row is gone or `users.sessions_valid_after` is later than `iat`.
- Cookies issued before `iat` existed read as `iat = 0`, so "sign out everywhere" ends them too.

## Returning users
Within 30 days the cookie signs them in. After that, or on a new device, any method lands on the same account and the same saved preferences.

## Account controls (Settings → Your account)
- **Sign out:** clears this browser's cookie.
- **Sign out everywhere** (`POST /api/auth/logout-all`): sets `sessions_valid_after = now()`, clears the cookie.
- **Delete my account** (`DELETE /api/me`, body `{"confirm":"delete"}`): deletes the `users` row; preferences, logins, saves and send history go with it (`ON DELETE CASCADE`).

## Known gaps
- Deleting the account does not delete the person's Supabase Auth record. Needs a Supabase admin call with the service key. **Unverified** how to do it on the free plan.
- No change-email or merge-accounts. A Google user who changes address gets a new account.
- Supabase's built-in confirmation and reset emails have a low rate limit (**unverified**). Route them through our email service once chosen.
- Owner view shows counts only (`/admin`); per-user lookup and send results are still to build.
- Migration `0011_sessions_valid_after.sql` must be run on Neon before deploying.

## Unsubscribe link (D-049)
- Welcome and digest emails link to `/api/auth/unsubscribe?token=<uid>.<HMAC>`. The pipeline signs it (`pipeline/notify/unsubscribe.py`), the web checks it (`web/server/unsubscribe.ts`); a test pins both to the same value.
- GET only forwards to `/unsubscribe` (scanners prefetch links). The button there sends POST, which deletes the account like `DELETE /api/me`.
- The name comes from `PUT /api/me/name`, asked on `/welcome` while the name is still the placeholder "Member".
