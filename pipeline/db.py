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
    "prize_text themes eligibility team_size invite_only"
).split()


def _event_values(rec: EventRecord) -> list:
    return [list(rec.themes) if f == "themes" else getattr(rec, f) for f in _EVENT_FIELDS]


def upsert_event(conn: psycopg.Connection, rec: EventRecord) -> str:
    """Insert or update one source listing. Returns 'new', 'changed' or 'same'.

    Phase 1: one event per (source, source_id). Cross-source dedupe arrives in Phase 2.
    """
    content_hash = rec.content_hash()
    with conn.transaction():
        row = conn.execute(
            "SELECT event_id, content_hash FROM event_sources WHERE source = %s AND source_id = %s",
            (rec.source, rec.source_id),
        ).fetchone()

        if row is None:
            cols = ", ".join(_EVENT_FIELDS)
            marks = ", ".join(["%s"] * len(_EVENT_FIELDS))
            event_id = conn.execute(
                f"INSERT INTO events ({cols}) VALUES ({marks}) RETURNING id", _event_values(rec)
            ).fetchone()[0]
            conn.execute(
                """
                INSERT INTO event_sources (event_id, source, source_id, url, raw_json, content_hash)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (event_id, rec.source, rec.source_id, rec.url, Jsonb(rec.raw), content_hash),
            )
            return "new"

        event_id, old_hash = row
        if old_hash == content_hash:
            conn.execute(
                "UPDATE event_sources SET last_seen_at = now()"
                " WHERE source = %s AND source_id = %s",
                (rec.source, rec.source_id),
            )
            return "same"

        sets = ", ".join(f"{f} = %s" for f in _EVENT_FIELDS)
        conn.execute(
            f"UPDATE events SET {sets}, updated_at = now(), status = 'open' WHERE id = %s",
            [*_event_values(rec), event_id],
        )
        conn.execute(
            """
            UPDATE event_sources
               SET url = %s, raw_json = %s, content_hash = %s, last_seen_at = now()
             WHERE source = %s AND source_id = %s
            """,
            (rec.url, Jsonb(rec.raw), content_hash, rec.source, rec.source_id),
        )
        return "changed"


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
