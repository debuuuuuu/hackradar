"""Postgres access for the pipeline (Neon)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

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
) -> None:
    conn.execute(
        """
        UPDATE runs
           SET finished_at = now(), status = %s, source_counts = %s, errors = %s
         WHERE id = %s
        """,
        (status, Jsonb(source_counts), Jsonb(errors), run_id),
    )


if __name__ == "__main__":
    # python -m pipeline.db init
    if sys.argv[1:] != ["init"]:
        sys.exit("usage: python -m pipeline.db init")
    load_dotenv()
    with connect() as conn:
        apply_schema(conn)
    print("schema applied")
