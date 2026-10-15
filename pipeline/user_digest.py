"""Per-user digests (tasks 2.3, 2.9). Kinds come from the AI kind field (D-036).

The owner's shared webhook digest stays in pipeline/digest.py + run.py (D-030). This module
builds one digest per approved user (D-040, D-041) and sends it once per IST day per channel.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import psycopg

from pipeline import config, digest
from pipeline.digest import _SELECT, CLOSING_WHERE, NEW_WHERE, ORDER, Digest, DigestItem
from pipeline.normalize import IST
from pipeline.notify.webhook_url import redact
from pipeline.sends import claim_send, mark_send

log = logging.getLogger(__name__)

# Priority -> event kinds it covers. Kinds are hackathon | contest | other (D-036), so workshop and
# fest both map to "other" until the kind taxonomy is split.
_KINDS_FOR_PRIORITY = {
    "hackathon": ("hackathon",),
    "contest": ("contest",),
    "workshop": ("other",),
    "fest": ("other",),
}
_ON = ("top", "normal")


def enabled_kinds(priorities: dict[str, str]) -> set[str]:
    """Kinds this person wants messaged. 'top' and 'normal' are on; anything else is off."""
    kinds: set[str] = set()
    for name, level in priorities.items():
        if level in _ON:
            kinds.update(_KINDS_FOR_PRIORITY.get(name, ()))
    return kinds


@dataclass(frozen=True)
class Recipient:
    user_id: int
    channels: tuple[str, ...]  # usable channels only (contact present, email confirmed)
    discord_webhook_enc: str | None
    email_enc: str | None
    callmebot_phone_enc: str | None
    callmebot_key_enc: str | None
    home_city: str
    radius_km: int
    format: str  # online_near | online | in_person | anything
    priorities: dict[str, str]


@dataclass
class RunSummary:
    sent: int = 0
    failed: int = 0
    empty: int = 0  # nothing to send today; no claim is written, so a later run can still send
    already_sent: int = 0


Sender = Callable[[Recipient, Digest], None]


def _email_confirmation_exists(conn: psycopg.Connection) -> bool:
    """Email is a channel only once a confirmation column exists (D-042, web task 3.1)."""
    return conn.execute(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns"
        " WHERE table_schema = current_schema() AND table_name = 'users'"
        " AND column_name = 'email_confirmed_at')"
    ).fetchone()[0]


def recipients(conn: psycopg.Connection, now: datetime) -> list[Recipient]:
    """Approved, onboarded users with digests on, with only their usable channels."""
    del now  # reserved for time-based gating; the query needs no clock today
    email_ok = _email_confirmation_exists(conn)
    rows = conn.execute("""
        SELECT u.id, COALESCE(p.channels -> 'digest', '[]'::jsonb), u.discord_webhook_enc,
               u.email_enc, u.callmebot_phone_enc, u.callmebot_key_enc,
               p.home_city, p.radius_km, p.format, p.priorities
          FROM users u
          JOIN preferences p ON p.user_id = u.id
         WHERE u.digest_enabled AND u.approved_at IS NOT NULL AND u.onboarded_at IS NOT NULL
         ORDER BY u.id
        """).fetchall()
    out = []
    for uid, chans, hook, email, phone, key, home, radius, fmt, prio in rows:
        usable = []
        for chan in chans:
            if chan == "discord" and hook:
                usable.append(chan)
            elif chan == "email" and email and email_ok:
                usable.append(chan)
            elif chan == "whatsapp" and phone and key:
                usable.append(chan)
        out.append(
            Recipient(
                user_id=uid,
                channels=tuple(usable),
                discord_webhook_enc=hook,
                email_enc=email,
                callmebot_phone_enc=phone,
                callmebot_key_enc=key,
                home_city=home,
                radius_km=radius,
                format=fmt,
                priorities=prio,
            )
        )
    return out


def _place_clause(conn: psycopg.Connection, r: Recipient) -> tuple[str, tuple]:
    """Place filter (D-034) for the person's format. Unknown home or radius: no distance filter."""
    if r.format == "anything":
        return "", ()
    if r.format == "online":
        return " AND (e.mode = 'online' OR e.mode IS NULL)", ()
    near = digest._near_cities(conn, {"home_city": r.home_city, "radius_km": r.radius_km})
    if r.format == "in_person":
        base = " AND e.mode IN ('offline', 'hybrid')"
        if near is None:
            return base, ()
        return base + " AND COALESCE(e.city = ANY(%s), false)", (near,)
    if near is None:  # online_near
        return "", ()
    where = " AND (e.mode = 'online' OR e.mode IS NULL OR COALESCE(e.city = ANY(%s), false))"
    return where, (near,)


def items_for(
    conn: psycopg.Connection, r: Recipient, since: datetime | None, now: datetime
) -> Digest:
    """This person's digest: new and closing hackathons, plus new contests and other kinds."""
    cfg = config.load("settings")["digest"]
    limit = cfg["list_limit"]
    today = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    soon = today + timedelta(days=cfg["closing_soon_days"] + 1)
    since = since or datetime.min.replace(tzinfo=IST)

    kinds = enabled_kinds(r.priorities)
    hack = ["hackathon"] if "hackathon" in kinds else []
    other = sorted(kinds - {"hackathon"})
    place_sql, place_params = _place_clause(conn, r)

    def run(kind_list: list[str], where: str, params: tuple) -> tuple[list[DigestItem], int]:
        if not kind_list:
            return [], 0
        base = " AND COALESCE(e.kind, 'hackathon') = ANY(%s)" + place_sql + where
        args = (kind_list, *place_params, *params)
        rows = conn.execute(_SELECT + base + ORDER + " LIMIT %s", (*args, limit)).fetchall()
        total = conn.execute(
            f"SELECT count(*) FROM events e WHERE e.status = 'open'{base}", args
        ).fetchone()[0]
        return [DigestItem(*row[:-1], tuple(row[-1])) for row in rows], total

    new, new_total = run(hack, NEW_WHERE, (since, soon))
    closing, closing_total = run(hack, CLOSING_WHERE, (today, soon))
    contests, contests_total = run(other, NEW_WHERE, (since, soon))
    open_total = run(hack, "", ())[1]
    return Digest(
        day=today.date().isoformat(),
        new=new,
        new_total=new_total,
        closing=closing,
        closing_total=closing_total,
        open_total=open_total,
        contests=contests,
        contests_total=contests_total,
    )


def _last_sent_at(conn: psycopg.Connection, user_id: int) -> datetime | None:
    """When this person last got a digest; "new" means first seen after that."""
    row = conn.execute(
        "SELECT max(sent_at) FROM sends WHERE user_id = %s AND status = 'sent'", (user_id,)
    ).fetchone()
    return row[0] if row else None


def _safe(exc: BaseException) -> str:
    """Exception text with webhook tokens and API keys masked. The raw message is never logged."""
    return redact(f"{type(exc).__name__}: {exc}")


def _deliver(
    conn: psycopg.Connection,
    r: Recipient,
    now: datetime,
    ist_date: date,
    senders: Mapping[str, Sender],
    summary: RunSummary,
) -> None:
    current = items_for(conn, r, _last_sent_at(conn, r.user_id), now)
    if current.empty:
        summary.empty += 1
        log.info("user %s: nothing new to send today", r.user_id)
        return
    for channel in r.channels:
        sender = senders.get(channel)
        if sender is None:
            continue
        if not claim_send(conn, r.user_id, ist_date, channel):
            summary.already_sent += 1
            continue
        conn.commit()  # the claim must be durable before the message goes out (sends.py)
        try:
            sender(r, current)
        except Exception as exc:
            mark_send(conn, r.user_id, ist_date, channel, "failed")
            conn.commit()
            summary.failed += 1
            log.error("user %s %s send failed: %s", r.user_id, channel, _safe(exc))
            continue
        mark_send(conn, r.user_id, ist_date, channel, "sent")
        conn.commit()
        summary.sent += 1


def run_user_digests(
    conn: psycopg.Connection, now: datetime, senders: Mapping[str, Sender]
) -> RunSummary:
    """Build and send each approved user's digest. One user's failure never stops the others."""
    ist_date = now.astimezone(IST).date()
    summary = RunSummary()
    for r in recipients(conn, now):
        try:
            _deliver(conn, r, now, ist_date, senders, summary)
        except Exception as exc:
            conn.rollback()
            summary.failed += 1
            log.error("user %s digest build failed: %s", r.user_id, _safe(exc))
    log.info(
        "user digests: %d sent, %d failed, %d empty, %d already sent",
        summary.sent,
        summary.failed,
        summary.empty,
        summary.already_sent,
    )
    return summary
