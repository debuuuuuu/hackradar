"""Phase 1 digest: new events + closing soon, sorted by deadline (no AI yet)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import psycopg

from pipeline import config, place
from pipeline.normalize import IST

log = logging.getLogger(__name__)

# The date that matters for joining: registration deadline first, then submission, then end.
DEADLINE_SQL = "COALESCE(e.reg_deadline, e.submission_deadline, e.end_date)"
# New events closing soon are listed only under "closing", never twice.
NEW_WHERE = f" AND e.first_seen_at > %s AND ({DEADLINE_SQL} IS NULL OR {DEADLINE_SQL} >= %s)"
CLOSING_WHERE = f" AND {DEADLINE_SQL} >= %s AND {DEADLINE_SQL} < %s"
ORDER = f" ORDER BY {DEADLINE_SQL} NULLS LAST, e.id"


@dataclass(frozen=True)
class DigestItem:
    title: str
    url: str
    deadline: datetime | None
    deadline_kind: str | None  # "reg" | "submit" | "ends"
    mode: str | None
    city: str | None
    prize_text: str | None
    source: str
    # Trust signals (D-031), all straight from the source listing.
    organizer: str | None = None
    registrations: int | None = None
    entry_fee: str | None = None
    invite_only: bool = False
    dates_suspect: bool = False  # end before start, or registration closes after the end
    summary: str | None = None  # AI-written (D-036); never used for dates or prizes
    platforms: tuple[str, ...] = ()  # every source listing this event (dedupe)


@dataclass(frozen=True)
class Digest:
    day: str  # IST date, e.g. "2026-10-15"
    new: list[DigestItem]
    new_total: int
    closing: list[DigestItem]
    closing_total: int
    open_total: int
    contests: list[DigestItem] = field(default_factory=list)  # new non-hackathons (kind)
    contests_total: int = 0
    far_hidden: int = 0  # in-person hackathons outside the travel radius
    radius_km: int | None = None

    @property
    def empty(self) -> bool:
        return self.new_total == 0 and self.closing_total == 0 and self.contests_total == 0


_SELECT = f"""
    SELECT e.title, s.url, {DEADLINE_SQL} AS deadline,
           CASE WHEN e.reg_deadline IS NOT NULL THEN 'reg'
                WHEN e.submission_deadline IS NOT NULL THEN 'submit'
                WHEN e.end_date IS NOT NULL THEN 'ends' END,
           e.mode, e.city, e.prize_text, s.source,
           e.organizer, s.registrations, e.entry_fee, e.invite_only,
           COALESCE(e.end_date < e.start_date OR e.reg_deadline > e.end_date, false),
           e.summary,
           (SELECT array_agg(DISTINCT source ORDER BY source) FROM event_sources
             WHERE event_id = e.id)
      FROM events e
      JOIN LATERAL (SELECT url, source, registrations FROM event_sources
                     WHERE event_id = e.id ORDER BY first_seen_at LIMIT 1) s ON true
     WHERE e.status = 'open'
"""


def last_digest_at(conn: psycopg.Connection, current_run_id: int) -> datetime | None:
    """End of the last run that actually sent a digest; "new" means first seen after it.

    Uses finished_at, not started_at, so events inserted during a slow run aren't counted twice,
    and ignores runs that sent nothing (e.g. local runs without a webhook) so no event is skipped.
    """
    row = conn.execute(
        "SELECT max(finished_at) FROM runs WHERE id <> %s AND notifications_sent > 0",
        (current_run_id,),
    ).fetchone()
    return row[0] if row else None


def build(conn: psycopg.Connection, since: datetime | None, now: datetime) -> Digest:
    cfg = config.load("settings")["digest"]
    limit = cfg["list_limit"]
    today = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    soon = today + timedelta(days=cfg["closing_soon_days"] + 1)
    since = since or datetime.min.replace(tzinfo=IST)

    # Hackathons by default (unclassified counts as one); contests/other get their own section.
    hack = " AND COALESCE(e.kind, 'hackathon') = 'hackathon'"
    other = " AND e.kind IN ('contest', 'other')"

    # Place filter (D-034): online (or unknown format) always; in person only near home.
    near = _near_cities(conn, cfg)
    in_range = " AND (e.mode = 'online' OR e.mode IS NULL OR COALESCE(e.city = ANY(%s), false))"
    too_far = " AND e.mode IN ('offline', 'hybrid') AND NOT COALESCE(e.city = ANY(%s), false)"

    def items(where: str, params: tuple) -> list[DigestItem]:
        rows = conn.execute(_SELECT + where + ORDER + " LIMIT %s", (*params, limit)).fetchall()
        return [DigestItem(*r[:-1], tuple(r[-1])) for r in rows]

    def count(where: str, params: tuple) -> int:
        sql = f"SELECT count(*) FROM events e WHERE e.status = 'open'{where}"
        return conn.execute(sql, params).fetchone()[0]

    # `near` is None when the filter is off: then every event is in range.
    def placed(kind: str, where: str, params: tuple) -> tuple[str, tuple]:
        if near is None:
            return kind + where, params
        return kind + in_range + where, (near, *params)

    new_q = placed(hack, NEW_WHERE, (since, soon))
    closing_q = placed(hack, CLOSING_WHERE, (today, soon))
    contests: list[DigestItem] = []
    contests_total = 0
    if cfg.get("show_contests", True):
        contests_q = placed(other, NEW_WHERE, (since, soon))
        contests, contests_total = items(*contests_q), count(*contests_q)
    return Digest(
        day=today.date().isoformat(),
        new=items(*new_q),
        new_total=count(*new_q),
        closing=items(*closing_q),
        closing_total=count(*closing_q),
        open_total=count(hack, ()),
        contests=contests,
        contests_total=contests_total,
        far_hidden=0 if near is None else count(hack + too_far, (near,)),
        radius_km=None if near is None else cfg["radius_km"],
    )


def _near_cities(conn: psycopg.Connection, cfg: dict) -> list[str] | None:
    """Source city strings within the travel radius of home, or None if the filter is off."""
    home, radius = cfg.get("home_city"), cfg.get("radius_km")
    if not home or not radius:
        return None
    cities = [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT city FROM events WHERE status = 'open' AND city IS NOT NULL"
            " AND mode IN ('offline', 'hybrid')"
        )
    ]
    try:
        near, unknown = place.near_cities(cities, home, radius)
    except ValueError:
        log.exception(
            "place filter off: bad home_city"
        )  # misconfiguration must not stop the digest
        return None
    if unknown:
        log.info("unknown places (add to config/places.yaml): %s", "; ".join(sorted(unknown)))
    return near
