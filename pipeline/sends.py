"""Send-once ledger for per-user messages (table `sends`, migration 0007)."""

from __future__ import annotations

from datetime import date

import psycopg


def claim_send(conn: psycopg.Connection, user_id: int, ist_date: date, channel: str) -> bool:
    """Reserve (user, day, channel) before sending. False means it was already claimed.

    The caller must COMMIT the claim before sending. A rollback would release it and allow a
    second send. A crash after the commit leaves the row as 'sent' and is not retried: a missed
    message is preferred to a duplicate.
    """
    row = conn.execute(
        """
        INSERT INTO sends (user_id, ist_date, channel, status)
        VALUES (%s, %s, %s, 'sent')
        ON CONFLICT (user_id, ist_date, channel) DO NOTHING
        RETURNING 1
        """,
        (user_id, ist_date, channel),
    ).fetchone()
    return row is not None


def mark_send(
    conn: psycopg.Connection, user_id: int, ist_date: date, channel: str, status: str
) -> None:
    """Record the final outcome of a claimed send: 'sent', 'failed' or 'skipped'."""
    conn.execute(
        "UPDATE sends SET status = %s WHERE user_id = %s AND ist_date = %s AND channel = %s",
        (status, user_id, ist_date, channel),
    )
