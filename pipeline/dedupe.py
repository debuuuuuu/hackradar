"""Cross-platform dedupe: merge the same event listed on two platforms into one `events` row.

Conservative on purpose: a wrong merge hides a real event, a missed one only shows it twice.
Only events from *different* sources are compared (one source never lists the same event twice,
and generic titles like "Hackathon" are common within a source). A match needs a distinctive
title overlap plus a second signal: a shared organiser word, or dates within a few days when
the titles are near-identical.
Every source URL is kept on the surviving event (`event_sources`).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

import psycopg

log = logging.getLogger(__name__)

TITLE_STOP = frozenset(
    "hackathon hack hackathons the a an of by and for in at on to with presents powered "
    "national level online virtual offline season edition challenge 2024 2025 2026 2027 "
    "india indian".split()
)
ORG_STOP = frozenset(
    "the of and for in at institute institution technology university college engineering "
    "school indian india national iit iiit nit club cell society pvt ltd llp foundation".split()
)
TITLE_OVERLAP = 0.8  # shared distinctive words / words in the shorter title
DATE_WINDOW_DAYS = 3
_WORD = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Candidate:
    id: int
    title: str
    organizer: str | None
    sources: frozenset[str]
    first_seen_at: datetime
    dates: tuple[datetime, ...] = ()


def words(text: str | None, stop: frozenset[str]) -> frozenset[str]:
    return frozenset(w for w in _WORD.findall((text or "").lower()) if w not in stop)


def is_duplicate(a: Candidate, b: Candidate) -> bool:
    if a.sources & b.sources:
        return False
    ta, tb = words(a.title, TITLE_STOP), words(b.title, TITLE_STOP)
    if not ta or not tb or len(ta & tb) / min(len(ta), len(tb)) < TITLE_OVERLAP:
        return False
    if words(a.organizer, ORG_STOP) & words(b.organizer, ORG_STOP):
        return True
    if len(ta & tb) / len(ta | tb) < TITLE_OVERLAP:  # dates alone only back near-identical titles
        return False
    gap = DATE_WINDOW_DAYS * 86400
    return any(abs((x - y).total_seconds()) <= gap for x in a.dates for y in b.dates)


def find_groups(cands: list[Candidate]) -> list[list[Candidate]]:
    """Groups of duplicates, oldest event first (it survives). Singletons are dropped."""
    cands = sorted(cands, key=lambda c: (c.first_seen_at, c.id))
    groups: list[list[Candidate]] = []
    for c in cands:
        for g in groups:
            # Compare against every member, and keep sources distinct across the group.
            if all(is_duplicate(m, c) for m in g):
                g.append(c)
                break
        else:
            groups.append([c])
    return [g for g in groups if len(g) > 1]


def _load(conn: psycopg.Connection) -> list[Candidate]:
    rows = conn.execute("""
        SELECT e.id, e.title, e.organizer, e.first_seen_at,
               array_agg(DISTINCT s.source),
               ARRAY[e.reg_deadline, e.start_date, e.end_date, e.submission_deadline]
          FROM events e JOIN event_sources s ON s.event_id = e.id
         WHERE e.status = 'open'
         GROUP BY e.id
        """).fetchall()
    return [
        Candidate(i, t, o, frozenset(srcs), seen, tuple(d for d in dates if d))
        for i, t, o, seen, srcs, dates in rows
    ]


def merge(conn: psycopg.Connection, keep_id: int, drop_id: int) -> None:
    """Move every listing and user state from `drop_id` onto `keep_id`, then delete `drop_id`."""
    with conn.transaction():
        conn.execute(
            "UPDATE event_sources SET event_id = %s WHERE event_id = %s", (keep_id, drop_id)
        )
        conn.execute(
            """
            INSERT INTO user_events (user_id, event_id, status, snoozed_until, created_at)
            SELECT user_id, %s, status, snoozed_until, created_at
              FROM user_events WHERE event_id = %s
            ON CONFLICT (user_id, event_id) DO NOTHING
            """,
            (keep_id, drop_id),
        )
        conn.execute("DELETE FROM events WHERE id = %s", (drop_id,))  # cascades the rest


def dedupe_events(conn: psycopg.Connection) -> int:
    """Merge cross-platform duplicates among open events. Returns how many rows were merged away."""
    merged = 0
    for group in find_groups(_load(conn)):
        keep, *rest = group
        for dup in rest:
            log.info(
                "dedupe: merging %r (#%d) into %r (#%d)", dup.title, dup.id, keep.title, keep.id
            )
            merge(conn, keep.id, dup.id)
            merged += 1
    return merged
