"""Busy periods: dates a user has blocked (exams, trips) and the rule for events that clash."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime

import psycopg

from pipeline.normalize import IST

PHYSICAL_MODES = {"offline", "hybrid"}


@dataclass(frozen=True)
class Period:
    starts_on: date
    ends_on: date
    label: str


def periods_for(conn: psycopg.Connection, user_id: int, today: date) -> list[Period]:
    """The user's busy periods that have not ended yet, earliest first."""
    rows = conn.execute(
        "SELECT starts_on, ends_on, label FROM busy_periods"
        " WHERE user_id = %s AND ends_on >= %s ORDER BY starts_on, ends_on, id",
        (user_id, today),
    ).fetchall()
    return [Period(r[0], r[1], r[2]) for r in rows]


def _ist_date(value: datetime | None) -> date | None:
    return value.astimezone(IST).date() if value else None


def clash_label(
    mode: str | None,
    start: datetime | None,
    end: datetime | None,
    submit: datetime | None,
    periods: Sequence[Period],
) -> str | None:
    """Label of the first period an event clashes with, else None.

    Clash: an offline or hybrid event whose start..end overlaps the period, or a submission
    deadline inside it. Online events never clash by span alone. IST calendar dates throughout.
    """
    first, last = _ist_date(start), _ist_date(end)
    first, last = first or last, last or first
    submit_day = _ist_date(submit)
    physical = mode in PHYSICAL_MODES and first is not None and last is not None
    for p in sorted(periods, key=lambda p: (p.starts_on, p.ends_on)):
        if physical and first <= p.ends_on and last >= p.starts_on:
            return p.label
        if submit_day is not None and p.starts_on <= submit_day <= p.ends_on:
            return p.label
    return None
