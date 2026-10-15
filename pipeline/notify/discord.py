"""Discord webhook delivery (Phase 1). Bot + buttons arrive in Phase 3."""

from __future__ import annotations

import logging
import re
import time

import httpx

from pipeline.digest import Digest, DigestItem
from pipeline.normalize import IST

log = logging.getLogger(__name__)

# Discord limits: 10 embeds/message, 4096 chars/description, 6000 chars total across all embeds.
DESCRIPTION_LIMIT = 4000
EMBEDS_TOTAL_BUDGET = 5600  # headroom under 6000 for titles
TITLE_MAX = 120
ORGANIZER_MAX = 60
SUMMARY_MAX = 160
DISCLAIMER = (
    "Dates, prizes and fees are copied from each platform's listing. Confirm on the event page."
)
COLOR_NEW = 0x5865F2
COLOR_CLOSING = 0xED4245
COLOR_CONTESTS = 0x99AAB5
KIND_LABEL = {"reg": "reg closes", "submit": "submit by", "ends": "ends"}
_MD_SPECIAL = re.compile(r"([\\*_~`|\[\]>])")


def escape(text: str) -> str:
    return _MD_SPECIAL.sub(r"\\\1", text)


def format_deadline(item: DigestItem) -> str:
    if item.deadline is None:
        return "no deadline listed"
    d = item.deadline.astimezone(IST)
    when = f"{d.day} {d:%b}"
    if (d.hour, d.minute) != (0, 0):  # date-only sources are stored at 00:00 IST (D-028)
        when += f", {d:%I:%M %p}".replace(" 0", " ")
    return f"{KIND_LABEL.get(item.deadline_kind, 'deadline')} {when}"


def format_item(item: DigestItem) -> str:
    where = "Online" if item.mode == "online" else (item.city or (item.mode or "").title() or "?")
    if item.mode == "hybrid":
        where = f"Hybrid · {item.city}" if item.city else "Hybrid"
    parts = [format_deadline(item), where]
    if item.organizer:
        parts.insert(0, f"by {escape(item.organizer[:ORGANIZER_MAX])}")
    if item.prize_text:
        parts.append(item.prize_text)
    if item.registrations:
        parts.append(f"👥 {item.registrations:,}")
    parts.append(item.source)
    title = item.title if len(item.title) <= TITLE_MAX else item.title[: TITLE_MAX - 1] + "…"
    line = f"**[{escape(title)}]({item.url})**\n{' · '.join(parts)}"
    if item.summary:
        text = " ".join(item.summary.split())
        if len(text) > SUMMARY_MAX:
            text = text[: SUMMARY_MAX - 1] + "…"
        line += f"\n*{escape(text)}*"
    flags = trust_flags(item)
    return f"{line}\n{' · '.join(flags)}" if flags else line


def trust_flags(item: DigestItem) -> list[str]:
    """Things to check before joining (D-031). Rules on source data only, never AI."""
    flags = []
    if len(item.platforms) > 1:
        flags.append(f"✅ listed on {' + '.join(item.platforms)}")
    if item.entry_fee:
        fee = "paid entry" if item.entry_fee == "paid" else f"{item.entry_fee} entry fee"
        flags.append(f"💰 {fee}")
    if item.invite_only:
        flags.append("🔒 invite-only")
    if not item.organizer:
        flags.append("⚠️ no organiser listed")
    if item.dates_suspect:
        flags.append("⚠️ dates look inconsistent, check the page")
    return flags


def _section(title: str, items: list[DigestItem], total: int, color: int, budget: int) -> dict:
    budget = min(budget, DESCRIPTION_LIMIT) - 40  # room for the "…and N more" line
    lines: list[str] = []
    length = 0
    for item in items:
        line = format_item(item)
        if length + len(line) + 2 > budget:
            break
        lines.append(line)
        length += len(line) + 2
    if total > len(lines):
        lines.append(f"*…and {total - len(lines)} more*")
    return {"title": title, "description": "\n\n".join(lines), "color": color}


def render(digest: Digest) -> dict:
    """Webhook payload for one digest."""
    header = f"🛰️ **HackRadar** · {digest.day} · {digest.open_total} open hackathons tracked"
    header += f"\n-# {DISCLAIMER}"
    if digest.empty:
        return {"content": f"{header}\nNothing new today and nothing closing in the next 3 days."}
    sections = []
    if digest.new_total:
        sections.append((f"🆕 New ({digest.new_total})", digest.new, digest.new_total, COLOR_NEW))
    if digest.closing_total:
        title = f"⏰ Closing within 3 days ({digest.closing_total})"
        sections.append((title, digest.closing, digest.closing_total, COLOR_CLOSING))
    if digest.contests_total:
        title = f"🧩 Contests & other ({digest.contests_total})"
        sections.append((title, digest.contests, digest.contests_total, COLOR_CONTESTS))
    budget = EMBEDS_TOTAL_BUDGET // len(sections)
    embeds = [_section(*s, budget=budget) for s in sections]
    return {"content": header, "embeds": embeds, "allowed_mentions": {"parse": []}}


def send(webhook_url: str, payload: dict, client: httpx.Client | None = None) -> None:
    """POST to a webhook, honouring Discord's 429 retry_after once or twice."""
    own = client is None
    client = client or httpx.Client(timeout=30)
    try:
        for _ in range(3):
            resp = client.post(webhook_url, json=payload)
            if resp.status_code == 429:
                wait = float(resp.json().get("retry_after", 1))
                log.warning("discord rate limited, waiting %.1fs", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return
        resp.raise_for_status()
    finally:
        if own:
            client.close()
