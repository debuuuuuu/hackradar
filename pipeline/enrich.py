"""Daily enrichment: AI summary + kind for open events that have none (new or changed).

Never fatal: no key, provider down or a bad reply just leaves events un-enriched until the next run.
CLI backfill: `uv run python -m pipeline.enrich --all`.
"""

from __future__ import annotations

import logging
import os
import sys

import psycopg
from dotenv import load_dotenv

from pipeline import ai, config, db
from pipeline.ai import summarize
from pipeline.ai.base import AIError, Provider

log = logging.getLogger(__name__)

_PENDING = """
    SELECT e.id, e.title, e.organizer, e.themes,
           (SELECT raw_json->>'details' FROM event_sources WHERE event_id = e.id
             ORDER BY first_seen_at LIMIT 1)
      FROM events e
     WHERE e.status = 'open' AND e.summary IS NULL
     ORDER BY COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) NULLS LAST, e.id
"""


def pending(conn: psycopg.Connection, limit: int | None) -> list[summarize.EventText]:
    sql = _PENDING + (" LIMIT %s" if limit else "")
    rows = conn.execute(sql, (limit,) if limit else ()).fetchall()
    return [summarize.EventText(r[0], r[1], r[2], r[3], r[4]) for r in rows]


def save(conn: psycopg.Connection, results: dict[int, summarize.Enriched]) -> None:
    if not results:
        return
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            "UPDATE events SET summary = %s, kind = %s WHERE id = %s",
            [(r.summary, r.kind, eid) for eid, r in results.items()],
        )


def enrich(
    conn: psycopg.Connection, provider: Provider | None = None, limit: int | None = -1
) -> int:
    """Summarise up to `limit` pending events (-1 = the configured daily cap, None = all).

    Saves after every batch. Neon closes idle connections during the long, paced AI wait, so a
    dead connection is replaced once per save instead of losing the work.
    """
    if limit == -1:
        limit = config.load("settings")["ai"]["max_events_per_run"]
    events = pending(conn, limit)
    if not events:
        return 0
    if provider is None:
        provider = ai.get_provider()
    live = {"conn": conn, "own": None}

    def save_batch(results: dict[int, summarize.Enriched]) -> None:
        try:
            save(live["conn"], results)
        except psycopg.OperationalError:
            log.warning("database connection lost during enrichment; reconnecting")
            live["own"] = live["conn"] = db.connect()
            save(live["conn"], results)

    try:
        results = summarize.summarize(provider, events, on_batch=save_batch)
    finally:
        if live["own"] is not None:
            live["own"].close()
    log.info("enriched %d of %d pending events", len(results), len(events))
    return len(results)


def enrich_safely(conn: psycopg.Connection, errors: list[str]) -> int:
    """For run.py: skip quietly without a key, record any failure, never raise."""
    if not os.environ.get("GROQ_API_KEY"):
        log.warning("GROQ_API_KEY not set; skipping enrichment")
        return 0
    try:
        return enrich(conn)
    except (AIError, psycopg.Error) as e:
        log.exception("enrichment failed")
        errors.append(f"enrich: {type(e).__name__}: {e}")
        return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    limit = None if "--all" in sys.argv else -1
    with db.connect() as conn:
        n = enrich(conn, limit=limit)
    print(f"enriched {n} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
