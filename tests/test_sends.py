"""Send-once ledger: a (user, IST day, channel) sends at most once, even across re-runs."""

from datetime import date

import psycopg
import pytest

from pipeline.sends import claim_send, mark_send


def _user(conn) -> int:
    return conn.execute("INSERT INTO users (name) VALUES ('t') RETURNING id").fetchone()[0]


def test_first_claim_wins_second_is_refused(conn) -> None:
    uid = _user(conn)
    day = date(2026, 10, 16)
    assert claim_send(conn, uid, day, "discord") is True
    assert claim_send(conn, uid, day, "discord") is False


def test_claims_are_per_channel_and_per_day(conn) -> None:
    uid = _user(conn)
    assert claim_send(conn, uid, date(2026, 10, 16), "discord") is True
    assert claim_send(conn, uid, date(2026, 10, 16), "email") is True
    assert claim_send(conn, uid, date(2026, 10, 17), "discord") is True


def test_mark_send_records_outcome(conn) -> None:
    uid = _user(conn)
    day = date(2026, 10, 16)
    claim_send(conn, uid, day, "email")
    mark_send(conn, uid, day, "email", "failed")
    status = conn.execute(
        "SELECT status FROM sends WHERE user_id = %s AND channel = 'email'", (uid,)
    ).fetchone()[0]
    assert status == "failed"


def test_unknown_channel_rejected(conn) -> None:
    uid = _user(conn)
    with pytest.raises(psycopg.errors.CheckViolation):
        claim_send(conn, uid, date(2026, 10, 16), "sms")
