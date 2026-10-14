# WhatsApp delivery options

- **Date:** 2026-10-14 (from planning session)
- **Status:** **unverified** — confirm CallMeBot signup flow and limits in Phase 3.

## Findings
| Option | Verdict | Why |
|---|---|---|
| CallMeBot | **Chosen** (D-013) | Free; each user sends a permission message once and gets their own API key; text only; no SLA |
| Twilio sandbox | Rejected | Users must rejoin the sandbox every 3 days |
| Unofficial libs (whatsapp-web.js, Baileys…) | Rejected | Against constraints (D-002); ban risk |
| Meta WhatsApp Cloud API | Later stretch | Could power a WhatsApp `/ask` bot; setup and free-tier terms unchecked |

Source: https://vec.wordpress.org/plugins/?p=266930 (third-party; prefer https://www.callmebot.com).

## Implications
- WhatsApp is best-effort; Discord and email are the reliable channels.
- Per-user keys are personal data → encrypted at rest (D-024).
