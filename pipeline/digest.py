"""Phase 1 digest: new events + closing soon, sorted by deadline (no AI yet)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import psycopg

from pipeline import config
from pipeline.normalize import IST

# The date that matters for joining: registration deadline first, then submission, then end.
DEADLINE_SQL = "COALESCE(e.reg_deadline, e.submission_deadline, e.end_date)"


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


@dataclass(frozen=True)
class Digest:
    day: str  # IST date, e.g. "2026-10-15"
    new: list[DigestItem]
    new_total: int
    closing: list[DigestItem]
    closing_total: int
    open_total: int

    @property
    def empty(self) -> bool:
        return self.new_total == 0 and self.closing_total == 0


_SELECT = f"""
    SELECT e.title, s.url, {DEADLINE_SQL} AS deadline,
           CASE WHEN e.reg_deadline IS NOT NULL THEN 'reg'
                WHEN e.submission_deadline IS NOT NULL THEN 'submit'
                WHEN e.end_date IS NOT NULL THEN 'ends' END,
           e.mode, e.city, e.prize_text, s.source,
           e.organizer, s.registrations, e.entry_fee, e.invite_only,
           COALESCE(e.end_date < e.start_date OR e.reg_deadline > e.end_date, false)
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

    # New events closing soon are listed only under "closing", never twice.
    new_where = f" AND e.first_seen_at > %s AND ({DEADLINE_SQL} IS NULL OR {DEADLINE_SQL} >= %s)"
    closing_where = f" AND {DEADLINE_SQL} >= %s AND {DEADLINE_SQL} < %s"
    order = f" ORDER BY {DEADLINE_SQL} NULLS LAST, e.id"

    def items(where: str, params: tuple) -> list[DigestItem]:
        rows = conn.execute(_SELECT + where + order + " LIMIT %s", (*params, limit)).fetchall()
        return [DigestItem(*r) for r in rows]

    def count(where: str, params: tuple) -> int:
        sql = f"SELECT count(*) FROM events e WHERE e.status = 'open'{where}"
        return conn.execute(sql, params).fetchone()[0]

    return Digest(
        day=today.date().isoformat(),
        new=items(new_where, (since, soon)),
        new_total=count(new_where, (since, soon)),
        closing=items(closing_where, (today, soon)),
        closing_total=count(closing_where, (today, soon)),
        open_total=count("", ()),
    )
