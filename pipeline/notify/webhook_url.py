"""Validate user-pasted Discord webhooks and scrub secrets from log text (D-040)."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

_DISCORD_WEBHOOK = re.compile(r"^/api/webhooks/(\d+)/([A-Za-z0-9_-]+)$")
_SECRET_PARTS = [
    re.compile(r"(/api/webhooks/\d+/)[A-Za-z0-9_-]+"),  # Discord webhook token
    re.compile(r"(apikey=)[^&\s]+"),  # CallMeBot key in the query string
]


def is_discord_webhook(url: str) -> bool:
    """True only for https://discord.com or discordapp.com webhook URLs with no query or port."""
    if not url:
        return False
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.query or parts.fragment:
        return False
    if parts.hostname not in ("discord.com", "discordapp.com") or parts.port is not None:
        return False
    return _DISCORD_WEBHOOK.match(parts.path) is not None


def redact(text: str) -> str:
    """Replace webhook tokens and CallMeBot keys in any text before it is logged."""
    out = text
    for pattern in _SECRET_PARTS:
        out = pattern.sub(r"\1****", out)
    return out
