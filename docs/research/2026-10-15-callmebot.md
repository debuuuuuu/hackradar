# CallMeBot WhatsApp API (D-013, task 2.6)

As of 2026-10-15. Sources fetched the same day:
- https://www.callmebot.com (overview; no API parameters, links to the article below)
- https://www.callmebot.com/blog/free-api-whatsapp-messages/ (the WhatsApp send article, dated 2021-03-20 on the page)

## Confirmed
- Endpoint: `https://api.callmebot.com/whatsapp.php` with GET query parameters.
- `phone`: the number linked to WhatsApp, with country code (example `+34...`).
- `text`: the message, URL-encoded. WhatsApp `*bold*` formatting is accepted.
- `apikey`: the key returned during activation.
- Activation: save the bot number in contacts, send "I allow callmebot to send me messages" to it on WhatsApp, and wait for the reply "API Activated for your phone number." The reply contains the key. If no key arrives within 2 minutes, retry after 24 hours.
- The free API is stated to be for personal use only.

## Unverified
- **Unverified:** maximum message length. Not stated on either page. The sender keeps messages short (under 1000 characters) as a self-imposed limit.
- **Unverified:** rate limit and daily message limit. Not stated on either page. The sender caps messages per run (`max_per_run`, default 5) until confirmed.
- **Unverified:** whether the service is still running and the key format today. The article date is 2021; no later date was shown.
- **Unverified:** whether personal-use-only wording is compatible with sending to a small friend group. Owner to decide; this is a legal/terms question.

## Decision impact
- Sender caps messages per run and never logs the phone or key.
- Messages are short: top items and a link to the site, not the full digest.
- Test traffic uses `httpx.MockTransport` only. The real API is never called from tests.
