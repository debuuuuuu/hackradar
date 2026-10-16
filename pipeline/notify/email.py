"""Email delivery over Gmail SMTP (D-012, task 2.7).

One message per recipient, addressed only to them (never CC or BCC). Credentials come only from
the environment (SMTP_USER, SMTP_APP_PASSWORD). The sender refuses to run without a confirmed
address: the caller (pipeline/user_digest.py) only offers the email channel once a confirmation
column exists (D-042). Errors name the exception type, never the address, password or body.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from collections.abc import Callable
from email.message import EmailMessage

from pipeline.crypto import decrypt
from pipeline.digest import Digest, DigestItem
from pipeline.notify.discord import format_deadline

log = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
TIMEOUT_SECONDS = 30


class EmailError(RuntimeError):
    """A send failed. The message never contains the address, password or message body."""


def _item_block(item: DigestItem) -> str:
    return f"- {item.title} ({format_deadline(item)})\n  {item.url}"


def render_body(digest: Digest, site_url: str | None) -> str:
    """Plain-text body: new and closing events with their source links, then the footer."""
    lines = [
        f"HackRadar digest for {digest.day}",
        f"New: {digest.new_total}. Closing within 3 days: {digest.closing_total}.",
        "",
    ]
    if digest.new:
        lines += ["New", *map(_item_block, digest.new), ""]
    if digest.closing:
        lines += ["Closing soon", *map(_item_block, digest.closing), ""]
    lines.append("Dates, prizes and fees are copied from each platform's listing. Confirm there.")
    lines.append("")
    if site_url:
        lines.append(f"Manage settings or stop these emails: {site_url.rstrip('/')}/settings")
    else:
        lines.append("Manage settings or stop these emails from your HackRadar account page.")
    return "\n".join(lines) + "\n"


def build_message(sender: str, to: str, digest: Digest, site_url: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"HackRadar digest, {digest.day}"
    msg["From"] = sender
    msg["To"] = to  # one recipient per message; no Cc or Bcc header is ever set
    msg.set_content(render_body(digest, site_url))
    return msg


def send_digest(to: str, digest: Digest, *, smtp_factory=smtplib.SMTP) -> None:
    """Send one digest email to one address over STARTTLS with the Gmail app password."""
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_APP_PASSWORD")
    if not user or not password:
        raise EmailError("SMTP_USER or SMTP_APP_PASSWORD is not set")
    site_url = os.environ.get("SITE_URL") or None
    if site_url is None:
        log.info("SITE_URL not set; email footer has no settings link")
    msg = build_message(user, to, digest, site_url)
    try:
        with smtp_factory(SMTP_HOST, SMTP_PORT, timeout=TIMEOUT_SECONDS) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(user, password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        # The library's messages can echo the server reply; keep only the type.
        raise EmailError(f"SMTP send failed: {type(exc).__name__}") from None


def sender_for(key: bytes, *, smtp_factory=smtplib.SMTP) -> Callable[[object, Digest], None]:
    """A per-user sender for pipeline.user_digest: decrypts the stored address, then sends."""

    def send(recipient, digest: Digest) -> None:
        if not recipient.email_enc:
            raise EmailError("no email address on file")
        address = decrypt(recipient.email_enc, key)
        send_digest(address, digest, smtp_factory=smtp_factory)

    return send
