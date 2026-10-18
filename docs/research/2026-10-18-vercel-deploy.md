# Vercel deploy from GitHub (observed 2026-10-18)

- Project `hackradar` had Root Directory `.` while the app is in `web/`. Git-triggered builds ran `vite build` at the repo root and failed with `sh: vite: command not found` (exit 127). Source: the build logs of deployments on 2026-10-18.
- Earlier production deployments were uploads from `web/` with the CLI, so they worked.
- Fix: Root Directory set to `web` in project settings; redeploy of the failed production deployment then built (Ready in 24 s) and aliased `hackradar-two.vercel.app`.
- With Root Directory `web`, do not run `vercel deploy` from inside `web/`; push to `main` instead.
- Preview deployments of branches still need their env vars set for Preview; unverified.
