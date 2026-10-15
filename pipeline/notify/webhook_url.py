"""Validate user-pasted Discord webhooks and scrub secrets from log text (D-040)."""

from __future__ import annotations

import re
from urllib.parse import unquote

# Whole-string match, ASCII only: no userinfo, port, query, fragment, spaces or uppercase host.
_DISCORD_WEBHOOK = re.compile(
    r"https://(?:discord\.com|discordapp\.com)/api/webhooks/[0-9]+/[A-Za-z0-9_-]+",
    re.ASCII,
)
_SECRET_PARTS = [
    re.compile(r"(/api/webhooks/[0-9]+/)[A-Za-z0-9_-]+", re.IGNORECASE),  # Discord token
    re.compile(r"(apikey=)[^&\s]+", re.IGNORECASE),  # CallMeBot key in the query string
]


def is_discord_webhook(url: str) -> bool:
    """True only for a plain https Discord webhook URL, nothing else."""
    return _DISCORD_WEBHOOK.fullmatch(url) is not None


def redact(text: str) -> str:
    """Mask webhook tokens and CallMeBot keys. Percent-escapes are decoded first."""
    out = text
    for _ in range(3):  # bounded: handles double-encoding without looping forever
        decoded = unquote(out)
        if decoded == out:
            break
        out = decoded
    for pattern in _SECRET_PARTS:
        out = pattern.sub(r"\1****", out)
    return out
