"""Discord webhook delivery (Phase 1). Bot + buttons arrive in Phase 3."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable

import httpx

from pipeline.digest import Digest, DigestItem, drop_picks
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
COLOR_PICKS = 0xFEE75C
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
    url = item.url.replace(" ", "%20").replace(")", "%29")
    line = f"**[{escape(title)}]({url})**\n{' · '.join(parts)}"
    if item.summary:
        text = " ".join(item.summary.split())
        if len(text) > SUMMARY_MAX:
            text = text[: SUMMARY_MAX - 1] + "…"
        line += f"\n*{escape(text)}*"
    flags = trust_flags(item)
    return f"{line}\n{' · '.join(flags)}" if flags else line


def format_pick(item: DigestItem) -> str:
    """A normal item line plus the AI's why. A clash is struck through, never hidden."""
    head, _, rest = format_item(item).partition("\n")
    lines = [f"~~{head}~~" if item.clash else head, rest]
    if item.why:
        lines.append(f"💡 {escape(' '.join(item.why.split()))}")
    if item.clash:
        lines.append(f"⚠️ Clashes with {escape(item.clash)}")
    return "\n".join(lines)


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
    if not item.organizer and item.source != "devfolio":  # its listing has no organiser field
        flags.append("⚠️ no organiser listed")
    if item.dates_suspect:
        flags.append("⚠️ dates look inconsistent, check the page")
    return flags


def _fit(items: list[DigestItem], budget: int, fmt: Callable[[DigestItem], str]) -> list[str]:
    """Formatted lines for as many leading items as fit the embed budget."""
    budget = min(budget, DESCRIPTION_LIMIT) - 40  # room for the "…and N more" line
    lines: list[str] = []
    length = 0
    for item in items:
        line = fmt(item)
        if length + len(line) + 2 > budget:
            break
        lines.append(line)
        length += len(line) + 2
    return lines


def _section(
    title: str,
    items: list[DigestItem],
    total: int,
    color: int,
    budget: int,
    fmt: Callable[[DigestItem], str] = format_item,
) -> dict:
    lines = _fit(items, budget, fmt)
    if total > len(lines):
        lines.append(f"*…and {total - len(lines)} more*")
    return {"title": title, "description": "\n\n".join(lines), "color": color}


def render(digest: Digest) -> dict:
    """Webhook payload for one digest."""
    header = f"🛰️ **HackRadar** · {digest.day} · {digest.open_total} open hackathons tracked"
    if digest.far_hidden:
        header += (
            f"\n-# {digest.far_hidden} in-person events farther than {digest.radius_km} km hidden."
        )
    header += f"\n-# {DISCLAIMER}"
    if digest.empty:
        return {"content": f"{header}\nNothing new today and nothing closing in the next 3 days."}
    counted = (digest.picks, digest.new_total, digest.closing_total, digest.contests_total)
    budget = EMBEDS_TOTAL_BUDGET // max(sum(map(bool, counted)), 1)
    embeds = []
    new, closing, new_gone, closing_gone = digest.new, digest.closing, 0, 0
    if digest.picks:
        lines = _fit(digest.picks, budget, format_pick)
        if lines:  # only the picks that fit leave the lists below; the rest stay there
            rendered = digest.picks[: len(lines)]
            title = f"⭐ Picked for you ({len(lines)})"
            embeds.append({"title": title, "description": "\n\n".join(lines), "color": COLOR_PICKS})
            new, new_gone = drop_picks(digest.new, rendered)
            closing, closing_gone = drop_picks(digest.closing, rendered)
    new_left, closing_left = digest.new_total - new_gone, digest.closing_total - closing_gone
    if new or new_left > 0:
        title = f"🆕 New ({digest.new_total})"
        embeds.append(_section(title, new, new_left, COLOR_NEW, budget))
    if closing or closing_left > 0:
        title = f"⏰ Closing within 3 days ({digest.closing_total})"
        embeds.append(_section(title, closing, closing_left, COLOR_CLOSING, budget))
    if digest.contests_total:
        title = f"🧩 Contests & other ({digest.contests_total})"
        embeds.append(
            _section(title, digest.contests, digest.contests_total, COLOR_CONTESTS, budget)
        )
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
