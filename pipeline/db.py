"""Postgres access for the pipeline (Neon)."""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

from pipeline.normalize import EventRecord

SCHEMA_PATH = Path(__file__).with_name("models.sql")


def connect() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


def apply_schema(conn: psycopg.Connection) -> None:
    """Run models.sql. Idempotent (CREATE ... IF NOT EXISTS)."""
    conn.execute(SCHEMA_PATH.read_text(encoding="utf-8"))


def start_run(conn: psycopg.Connection, trigger: str) -> int:
    row = conn.execute("INSERT INTO runs (trigger) VALUES (%s) RETURNING id", (trigger,)).fetchone()
    assert row is not None
    return row[0]


def finish_run(
    conn: psycopg.Connection,
    run_id: int,
    status: str,
    source_counts: dict[str, int],
    errors: list[str],
    notifications_sent: int = 0,
) -> None:
    conn.execute(
        """
        UPDATE runs
           SET finished_at = now(), status = %s, source_counts = %s, errors = %s,
               notifications_sent = %s
         WHERE id = %s
        """,
        (status, Jsonb(source_counts), Jsonb(errors), notifications_sent, run_id),
    )


_EVENT_FIELDS = (
    "title organizer mode city country reg_deadline start_date end_date submission_deadline "
    "prize_text themes eligibility team_size invite_only entry_fee"
).split()


def _event_values(rec: EventRecord) -> list:
    return [list(rec.themes) if f == "themes" else getattr(rec, f) for f in _EVENT_FIELDS]


def upsert_events(conn: psycopg.Connection, recs: list[EventRecord]) -> list[str]:
    """Insert or update one source's listings in one transaction.

    Returns 'new', 'changed' or 'same' per record, in order. One lookup query plus batched
    (pipelined) writes, because per-row round trips to Neon made a 250-listing source take minutes.
    Phase 1: one event per (source, source_id). Cross-source dedupe arrives in Phase 2.
    """
    if not recs:
        return []
    sources = {r.source for r in recs}
    assert len(sources) == 1, f"one source per call, got {sources}"
    source = sources.pop()
    hashes = [r.content_hash() for r in recs]
    rows = conn.execute(
        "SELECT source_id, event_id, content_hash FROM event_sources"
        " WHERE source = %s AND source_id = ANY(%s)",
        (source, [r.source_id for r in recs]),
    ).fetchall()
    known = {sid: (event_id, old_hash) for sid, event_id, old_hash in rows}

    outcomes: list[str] = []
    new: list[tuple[EventRecord, str]] = []
    changed: list[tuple[EventRecord, str, int]] = []
    same: list[EventRecord] = []
    for rec, content_hash in zip(recs, hashes, strict=True):
        if rec.source_id not in known:
            known[rec.source_id] = (None, content_hash)  # a repeat in this batch counts as 'same'
            new.append((rec, content_hash))
            outcomes.append("new")
        elif known[rec.source_id][1] == content_hash:
            same.append(rec)
            outcomes.append("same")
        else:
            changed.append((rec, content_hash, known[rec.source_id][0]))
            outcomes.append("changed")

    cols = ", ".join(_EVENT_FIELDS)
    marks = ", ".join(["%s"] * len(_EVENT_FIELDS))
    sets = ", ".join(f"{f} = %s" for f in _EVENT_FIELDS)
    with conn.transaction(), conn.cursor() as cur:
        if new:
            cur.executemany(
                f"INSERT INTO events ({cols}) VALUES ({marks}) RETURNING id",
                [_event_values(rec) for rec, _ in new],
                returning=True,
            )
            event_ids = []
            while True:
                event_ids.append(cur.fetchone()[0])
                if not cur.nextset():
                    break
            cur.executemany(
                """
                INSERT INTO event_sources
                       (event_id, source, source_id, url, raw_json, content_hash, registrations)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (eid, r.source, r.source_id, r.url, Jsonb(r.raw), h, r.registrations)
                    for eid, (r, h) in zip(event_ids, new, strict=True)
                ],
            )
        if changed:
            cur.executemany(
                f"UPDATE events SET {sets}, updated_at = now(), status = 'open' WHERE id = %s",
                [[*_event_values(rec), event_id] for rec, _, event_id in changed],
            )
            cur.executemany(
                """
                UPDATE event_sources
                   SET url = %s, raw_json = %s, content_hash = %s, last_seen_at = now(),
                       registrations = %s
                 WHERE source = %s AND source_id = %s
                """,
                [
                    (r.url, Jsonb(r.raw), h, r.registrations, r.source, r.source_id)
                    for r, h, _ in changed
                ],
            )
        if same:
            cur.executemany(
                "UPDATE event_sources SET last_seen_at = now(), registrations = %s"
                " WHERE source = %s AND source_id = %s",
                [(r.registrations, r.source, r.source_id) for r in same],
            )
    return outcomes


def close_past_events(conn: psycopg.Connection, today_ist_start: datetime) -> int:
    """Mark events closed once their last known date is before today (IST)."""
    cur = conn.execute(
        """
        UPDATE events SET status = 'closed', updated_at = now()
         WHERE status = 'open'
           AND COALESCE(submission_deadline, end_date, reg_deadline, start_date) < %s
        """,
        (today_ist_start,),
    )
    return cur.rowcount


if __name__ == "__main__":
    # python -m pipeline.db init
    if sys.argv[1:] != ["init"]:
        sys.exit("usage: python -m pipeline.db init")
    load_dotenv()
    with connect() as conn:
        apply_schema(conn)
    print("schema applied")
