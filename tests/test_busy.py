"""Busy periods (For you picks): which events clash with a user's blocked dates."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from pipeline.busy import Period, clash_label, periods_for
from pipeline.normalize import IST

EXAMS = Period(date(2026, 11, 10), date(2026, 11, 15), "exams")


def ist(month: int, day: int, hour: int = 12, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=IST)


@pytest.mark.parametrize(
    ("mode", "start", "end", "submit", "expected"),
    [
        ("offline", ist(11, 14), ist(11, 16), None, "exams"),
        ("hybrid", ist(11, 1), ist(11, 10), None, "exams"),
        ("offline", ist(11, 16), ist(11, 18), None, None),
        ("online", ist(11, 1), ist(11, 30), None, None),
        ("online", ist(11, 1), ist(11, 30), ist(11, 12), "exams"),
        ("offline", None, None, None, None),
        ("online", None, None, None, None),
        (None, None, None, None, None),
        ("offline", ist(11, 5), ist(11, 9, 23, 59), None, None),
        ("offline", ist(11, 15, 23, 30), ist(11, 17), None, "exams"),
    ],
)
def test_clash_label_cases(mode, start, end, submit, expected) -> None:
    assert clash_label(mode, start, end, submit, [EXAMS]) == expected


def test_start_only_and_end_only_events_use_the_known_date() -> None:
    assert clash_label("offline", ist(11, 12), None, None, [EXAMS]) == "exams"
    assert clash_label("offline", None, ist(11, 12), None, [EXAMS]) == "exams"


def test_start_only_event_after_the_period_does_not_clash() -> None:
    assert clash_label("offline", ist(11, 16), None, None, [EXAMS]) is None


def test_unsorted_periods_earliest_start_wins() -> None:
    later = Period(date(2026, 11, 12), date(2026, 11, 20), "trip")
    assert clash_label("offline", ist(11, 13), ist(11, 14), None, [later, EXAMS]) == "exams"


def test_ist_date_not_utc_date() -> None:
    # 2026-11-16 00:30 IST is 2026-11-15 19:00 UTC; the IST date is the 16th, so no clash.
    assert clash_label("offline", ist(11, 16, 0, 30), ist(11, 17), None, [EXAMS]) is None
    # Submission 2026-11-10 00:15 IST is still the 9th in UTC; IST date is inside.
    assert clash_label("online", None, None, ist(11, 10, 0, 15), [EXAMS]) == "exams"


def test_first_clashing_period_wins() -> None:
    later = Period(date(2026, 11, 12), date(2026, 11, 20), "trip")
    assert clash_label("offline", ist(11, 13), ist(11, 14), None, [EXAMS, later]) == "exams"
    assert clash_label("offline", ist(11, 16), ist(11, 17), None, [EXAMS, later]) == "trip"


def test_no_periods_no_clash() -> None:
    assert clash_label("offline", ist(11, 13), ist(11, 14), None, []) is None


# --- database tests -------------------------------------------------------------------------


def test_periods_for_returns_current_and_future_ordered(conn) -> None:
    uid = conn.execute("INSERT INTO users (name) VALUES ('a') RETURNING id").fetchone()[0]
    other = conn.execute("INSERT INTO users (name) VALUES ('b') RETURNING id").fetchone()[0]
    rows = [
        (uid, date(2026, 12, 1), date(2026, 12, 5), "later"),
        (uid, date(2026, 10, 1), date(2026, 10, 22), "past"),
        (uid, date(2026, 10, 20), date(2026, 10, 23), "ends today"),
        (other, date(2026, 11, 1), date(2026, 11, 2), "someone else"),
    ]
    for r in rows:
        conn.execute(
            "INSERT INTO busy_periods (user_id, starts_on, ends_on, label) VALUES (%s,%s,%s,%s)", r
        )
    got = periods_for(conn, uid, date(2026, 10, 23))
    assert [p.label for p in got] == ["ends today", "later"]
    assert got[0] == Period(date(2026, 10, 20), date(2026, 10, 23), "ends today")
