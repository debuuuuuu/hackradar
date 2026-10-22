"""WhatsApp delivery via CallMeBot (D-013, task 2.6).

Research: docs/research/2026-10-15-callmebot.md. Short messages only: the top items and a link to
the site. The CallMeBot length and rate limits are unverified, so messages are capped in length
here and per run in WhatsAppSender. The phone number and apikey are never logged, and errors
never carry the request URL.
"""

from __future__ import annotations

import httpx

from pipeline.digest import Digest, DigestItem, drop_picks
from pipeline.notify.discord import format_deadline
from pipeline.notify.webhook_url import guard_http_logs

API_URL = "https://api.callmebot.com/whatsapp.php"
MAX_CHARS = 1000  # self-imposed; CallMeBot's own limit is unverified
DEFAULT_MAX_PER_RUN = 5  # unverified provider limit; kept low until confirmed
TITLE_MAX = 80
PICKS_MAX = 3
WHY_MAX = 90  # keeps three picks well inside MAX_CHARS, so the closing site link is never cut


class WhatsAppError(RuntimeError):
    """A send failed. The message names the HTTP status or exception type, never the URL."""


class CapReached(WhatsAppError):
    """The per-run message cap was hit; the message was not sent."""


def _item_line(number: int, item: DigestItem, label: str | None = None) -> str:
    title = item.title if len(item.title) <= TITLE_MAX else item.title[: TITLE_MAX - 1] + "…"
    return f"{label or f'{number}.'} {title} ({format_deadline(item)})"


def _pick_line(number: int, item: DigestItem) -> str:
    line = _item_line(number, item, f"Pick {number}:")
    if item.why:
        why = item.why if len(item.why) <= WHY_MAX else item.why[: WHY_MAX - 1] + "…"
        line += f" - {why}"
    if item.clash:
        line += f" [clashes with {item.clash}]"
    return line


def short_text(digest: Digest, site_url: str, top: int = 3) -> str:
    """A plain-text summary: counts, the first few items, and the site link. Never the full list."""
    if digest.empty:
        return f"HackRadar {digest.day}: Nothing new today. {site_url}"
    head = f"HackRadar {digest.day}: {digest.new_total} new, {digest.closing_total} closing soon."
    picks = digest.picks[:PICKS_MAX]
    new, new_gone = drop_picks(digest.new, picks)  # picks 4+ stay in the list below
    closing, closing_gone = drop_picks(digest.closing, picks)
    items = [*new, *closing][:top]
    shown = len(items)
    total = digest.new_total + digest.closing_total - new_gone - closing_gone
    lines = [head]
    if picks:
        lines += ["Picked for you:", *(_pick_line(i + 1, p) for i, p in enumerate(picks))]
        lines.append(f"Everything else: {site_url.rstrip('/')}/events")
    lines += [_item_line(i + 1, item) for i, item in enumerate(items)]
    if total > shown:
        lines.append(f"...and {total - shown} more.")
    lines.append(f"All details and sources: {site_url}")
    text = "\n".join(lines)
    return text if len(text) <= MAX_CHARS else text[: MAX_CHARS - 1] + "…"


class WhatsAppSender:
    """Sends through CallMeBot with GET requests. One instance per run, so the cap is per run."""

    def __init__(
        self,
        *,
        max_per_run: int = DEFAULT_MAX_PER_RUN,
        client: httpx.Client | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.max_per_run = max_per_run
        self._client = client or httpx.Client(timeout=timeout)
        self._sent = 0
        guard_http_logs()  # the request URL carries the phone and apikey

    def send_text(self, phone: str, apikey: str, text: str) -> None:
        if self._sent >= self.max_per_run:
            raise CapReached(f"per-run cap of {self.max_per_run} WhatsApp messages reached")
        params = {"phone": phone, "apikey": apikey, "text": text[:MAX_CHARS]}
        try:
            resp = self._client.get(API_URL, params=params)
        except httpx.HTTPError as exc:
            # Transport errors can echo the URL, which holds the phone and apikey.
            raise WhatsAppError(f"CallMeBot request failed: {type(exc).__name__}") from None
        if resp.status_code >= 400:
            raise WhatsAppError(f"CallMeBot returned HTTP {resp.status_code}")
        self._sent += 1
