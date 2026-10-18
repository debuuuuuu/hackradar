"""Unsubscribe link for emails. Signs like web/server/unsubscribe.ts, so the site accepts it.

Token = "<user id>.<base64url HMAC-SHA256>", keyed from ENCRYPTION_KEY (no extra secret to manage).
Opening the link only shows a confirm page; the button there deletes the account.
"""

from __future__ import annotations

import base64
import hashlib
import hmac


def unsubscribe_token(key: bytes, user_id: int) -> str:
    sub_key = hmac.new(key, b"unsubscribe-v1", hashlib.sha256).digest()
    mac = hmac.new(sub_key, f"unsub:{user_id}".encode(), hashlib.sha256).digest()
    return f"{user_id}.{base64.urlsafe_b64encode(mac).rstrip(b'=').decode()}"


def unsubscribe_url(site_url: str, key: bytes, user_id: int) -> str:
    return f"{site_url.rstrip('/')}/api/auth/unsubscribe?token={unsubscribe_token(key, user_id)}"
