# ruff: noqa: E501  (inline-style HTML strings are long on purpose)
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
from html import escape

from pipeline.crypto import decrypt
from pipeline.digest import Digest, DigestItem, drop_picks
from pipeline.normalize import IST
from pipeline.notify.calendar import gcal_link
from pipeline.notify.discord import format_deadline
from pipeline.notify.unsubscribe import unsubscribe_url

log = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
TIMEOUT_SECONDS = 30


class EmailError(RuntimeError):
    """A send failed. The message never contains the address, password or message body."""


def _gcal_url(item: DigestItem) -> str | None:
    """Google Calendar link for an item's deadline day (IST), or None when there is no deadline."""
    if item.deadline is None:
        return None
    date_str = item.deadline.astimezone(IST).strftime("%Y-%m-%d")
    return gcal_link(item.title, date_str, None, item.url, item.city)


def _item_block(item: DigestItem) -> str:
    block = f"- {item.title} ({format_deadline(item)})\n  {item.url}"
    cal = _gcal_url(item)
    return f"{block}\n  Add to Google Calendar: {cal}" if cal else block


def _pick_block(item: DigestItem) -> str:
    lines = [_item_block(item)]
    if item.why:
        lines.append(f"  {item.why}")
    if item.clash:
        lines.append(f"  Clashes with {item.clash}")
    return "\n".join(lines)


def render_body(digest: Digest, site_url: str | None, unsub_url: str | None = None) -> str:
    """Plain-text body: new and closing events with their source links, then the footer."""
    lines = [
        f"HackRadar digest for {digest.day}",
        f"New: {digest.new_total}. Closing within 3 days: {digest.closing_total}.",
        "",
    ]
    if digest.picks:
        lines += ["Picked for you", *map(_pick_block, digest.picks)]
        if site_url:
            lines.append(f"Everything else: {site_url.rstrip('/')}/events")
        lines.append("")
    new, _ = drop_picks(digest.new, digest.picks)  # every pick is rendered above
    closing, _ = drop_picks(digest.closing, digest.picks)
    if new:
        lines += ["New", *map(_item_block, new), ""]
    if closing:
        lines += ["Closing soon", *map(_item_block, closing), ""]
    lines.append("Dates, prizes and fees are copied from each platform's listing. Confirm there.")
    lines.append("")
    if site_url:
        lines.append(f"Manage settings or stop these emails: {site_url.rstrip('/')}/settings")
    else:
        lines.append("Manage settings or stop these emails from your HackRadar account page.")
    if unsub_url:
        lines += ["", f"Leave HackRadar (this also deletes your account): {unsub_url}"]
    return "\n".join(lines) + "\n"


# HTML version, in the design from design/hackradar-preview/Messages.dc.html. Email clients ignore
# most CSS, so it is inline styles only. Web fonts are not available there, so the serif and
# handwritten fonts fall back to Georgia and a cursive font.
_INK, _SOFT, _MUTE, _CORAL, _CREAM = "#2a1615", "#5a3532", "#7a4b47", "#e5484d", "#f3e7d7"
_MONO = "font-family:Menlo,Consolas,monospace;"


def _safe_url(url: str) -> str:
    """Only http(s) links reach an href, so a stored URL can never be a javascript: link."""
    return escape(url, quote=True) if url.startswith(("https://", "http://")) else "#"


def _meta(item: DigestItem) -> str:
    where = "Online" if item.mode == "online" else (item.city or (item.mode or "").title())
    parts = [p for p in (where, item.prize_text, f"from {item.source}") if p]
    return " · ".join(parts)


def _row(item: DigestItem) -> str:
    badge = ""
    if item.deadline is not None:
        badge = (
            f'<span style="float:right;background:{_INK};color:{_CREAM};border-radius:6px;'
            f'padding:1px 8px;font-size:13px;">{escape(format_deadline(item))}</span>'
        )
    cal = _gcal_url(item)
    cal_link = (
        f'<br><a href="{_safe_url(cal)}" style="{_MONO}font-size:12px;color:#9b2b2f;">'
        "&#128197; Add to Google Calendar</a>"
        if cal
        else ""
    )
    return (
        f'<div style="padding:10px 0;border-top:1.5px dashed #c9a79f;">{badge}'
        f'<a href="{_safe_url(item.url)}" style="font-family:Georgia,serif;font-size:18px;'
        f'color:{_INK};text-decoration:none;">{escape(item.title)}</a><br>'
        f'<span style="{_MONO}font-size:12px;color:{_MUTE};">{escape(_meta(item))}</span>'
        f"{cal_link}</div>"
    )


def _pick_row(item: DigestItem) -> str:
    """A normal row plus the why line; a clashing pick is dimmed, not dropped."""
    extra = ""
    if item.why:
        extra += f'<br><span style="font-size:13px;font-style:italic;">{escape(item.why)}</span>'
    if item.clash:
        extra += (
            f'<br><span style="{_MONO}font-size:12px;color:#9b2b2f;">'
            f"Clashes with {escape(item.clash)}</span>"
        )
    row = _row(item)[: -len("</div>")] + extra + "</div>"
    if item.clash:
        row = f'<div style="opacity:.55;">{row}</div>'
    return row


def _picks_section(items: list[DigestItem], site: str | None) -> str:
    if not items:
        return ""
    link = ""
    if site:
        link = (
            f'<p style="margin:6px 0 0;font-size:13px;"><a href="{_safe_url(site + "/events")}" '
            f'style="color:#9b2b2f;">Everything else on the site</a></p>'
        )
    head = (
        f'<p style="margin:18px 0 0;{_MONO}font-size:11px;letter-spacing:.06em;'
        f'text-transform:uppercase;color:{_MUTE};">Picked for you</p>'
    )
    return head + "".join(_pick_row(i) for i in items) + link


def _section(title: str, items: list[DigestItem], total: int) -> str:
    if not items and total <= 0:
        return ""
    more = f'<p style="margin:6px 0 0;font-size:13px;color:{_MUTE};">+{total - len(items)} more on the site</p>'
    return f'<p style="margin:18px 0 0;{_MONO}font-size:11px;letter-spacing:.06em;text-transform:uppercase;' f'color:{_MUTE};">{escape(title)}</p>' + "".join(
        _row(i) for i in items
    ) + (
        more if total > len(items) else ""
    )


def render_html(digest: Digest, site_url: str | None, unsub_url: str | None = None) -> str:
    site = site_url.rstrip("/") if site_url else None
    button = manage = ""
    if site:
        button = (
            f'<p style="margin:22px 0 0;"><a href="{_safe_url(site + "/events")}" style="display:inline-block;'
            f"background:{_CORAL};color:#fff;text-decoration:none;font-weight:bold;font-size:16px;"
            f'padding:12px 26px;border-radius:999px;">Show me everything &rarr;</a></p>'
        )
        manage = (
            f' <a href="{_safe_url(site + "/settings")}" style="color:#9b2b2f;">Turn me down</a>.'
        )
    leave = ""
    if unsub_url:
        leave = (
            f' Too chatty? <a href="{_safe_url(unsub_url)}" style="color:#9b2b2f;">Unsubscribe in one click</a>'
            " (this also deletes your account)."
        )
    new, new_gone = drop_picks(digest.new, digest.picks)  # every pick is rendered above
    closing, closing_gone = drop_picks(digest.closing, digest.picks)
    mascot = f'<span style="{_MONO}color:{_CORAL};">[^&#8255;^]</span>'
    if (
        site
    ):  # the site's own mascot, hosted at /email/mascot.png; the face text shows if images are blocked
        mascot = (
            f'<img src="{_safe_url(site + "/email/mascot.png")}" width="40" height="40" alt="[^&#8255;^]" '
            f'style="vertical-align:middle;border:0;{_MONO}color:{_CORAL};">'
        )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1f1e1d;padding:28px 12px;">'
        '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'
        '<tr><td style="padding:0 4px 14px;font-family:Georgia,serif;font-size:22px;color:#ede6dc;">'
        f"{mascot} HackRadar</td></tr>"
        f'<tr><td style="background:{_CREAM};border-radius:14px;border-top:6px solid {_CORAL};padding:26px 26px 22px;'
        f'font-family:Helvetica,Arial,sans-serif;color:{_SOFT};font-size:15px;line-height:1.5;">'
        f'<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:26px;color:{_INK};">Rise and build</h1>'
        '<p style="margin:0 0 4px;">I woke up early so you didn\'t have to. Fresh finds, still warm:</p>'
        f'<p style="margin:0;{_MONO}font-size:12px;color:{_MUTE};">{escape(digest.day)} · {digest.new_total} new · '
        f"{digest.closing_total} closing within 3 days</p>"
        + _picks_section(digest.picks, site)
        + _section("New", new, digest.new_total - new_gone)
        + _section("Closing soon", closing, digest.closing_total - closing_gone)
        + _section("Contests and other", digest.contests, digest.contests_total)
        + button
        + f'<p style="margin:20px 0 0;font-size:12px;color:{_MUTE};">Dates, prizes and fees are copied from each '
        f"platform's listing. Confirm there.{manage}{leave}</p>"
        "</td></tr></table></td></tr></table>"
    )


def _subject(digest: Digest) -> str:
    if digest.new_total:
        return f"Rise and build [o_o] {digest.new_total} new"
    return f"Rise and build [o_o] {digest.closing_total or digest.contests_total} to look at"


def build_message(
    sender: str, to: str, digest: Digest, site_url: str | None, unsub_url: str | None = None
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = _subject(digest)
    msg["From"] = f"HackRadar <{sender}>"
    msg["To"] = to  # one recipient per message; no Cc or Bcc header is ever set
    if unsub_url:  # lets Gmail and Apple Mail show their own unsubscribe link
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
    msg.set_content(render_body(digest, site_url, unsub_url))
    msg.add_alternative(render_html(digest, site_url, unsub_url), subtype="html")
    return msg


def send_digest(
    to: str, digest: Digest, *, unsub_url: str | None = None, smtp_factory=smtplib.SMTP
) -> None:
    """Send one digest email to one address over STARTTLS with the Gmail app password."""
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_APP_PASSWORD")
    if not user or not password:
        raise EmailError("SMTP_USER or SMTP_APP_PASSWORD is not set")
    site_url = os.environ.get("SITE_URL") or None
    if site_url is None:
        log.info("SITE_URL not set; email footer has no settings link")
    msg = build_message(user, to, digest, site_url, unsub_url)
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
        site_url = os.environ.get("SITE_URL")
        unsub = unsubscribe_url(site_url, key, recipient.user_id) if site_url else None
        send_digest(address, digest, unsub_url=unsub, smtp_factory=smtp_factory)

    return send
