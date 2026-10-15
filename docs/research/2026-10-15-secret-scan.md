# Secret scan of full git history (2026-10-15)

- **Date:** 2026-10-15 (IST)
- **Tool:** gitleaks 8.30.1 (MIT, free, installed with `winget install Gitleaks.Gitleaks`), source https://github.com/gitleaks/gitleaks
- **Command:** `gitleaks detect --source . --log-opts="--all"` on `C:\coding\hackfinding`
- **Result:** 52 commits scanned, ~909 KB, **no leaks found**.
- **Why this matters:** the repo has been public since 2026-10-14 (D-017), so anything committed is already visible.

## Earlier manual pattern scan (same day, before gitleaks)
Postgres URLs, Discord webhook URLs, Groq and Google key shapes, private-key headers. Hits were all placeholders:
`localhost` test DB URLs in CI and web tests, `u:p` fixtures, webhook id `1` in `tests/test_discord.py`.

## Limits
- Covers git history only. Not the Actions logs (public for this repo), Neon data, or the Vercel project.
- Re-run before each release and after any change to `.env.example` or workflow files.
- **Unverified:** whether any past Actions run printed a secret. Check logs of older runs before launch.

## Follow-up
- Add `gitleaks` as a CI step (Phase 1 task 1.2 follow-up).
