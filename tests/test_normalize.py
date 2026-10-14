from datetime import date

import pytest

from pipeline.normalize import EventRecord, clean_prize, ist_day_start, parse_date_range


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Aug 31 - Oct 23, 2026", (date(2026, 8, 31), date(2026, 10, 23))),
        ("Oct 12 - 24, 2026", (date(2026, 10, 12), date(2026, 10, 24))),
        ("Dec 15, 2026 - Jan 10, 2027", (date(2026, 12, 15), date(2027, 1, 10))),
        ("Dec 20 - Jan 05, 2027", (date(2026, 12, 20), date(2027, 1, 5))),  # wraps year
        ("Oct 14, 2026", (date(2026, 10, 14), date(2026, 10, 14))),
    ],
)
def test_parse_date_range(text, expected):
    assert parse_date_range(text) == expected


@pytest.mark.parametrize("text", ["", "TBA", "about 4 hours left"])
def test_parse_date_range_unknown(text):
    assert parse_date_range(text) is None


def test_ist_day_start():
    assert ist_day_start(date(2026, 10, 23)).isoformat() == "2026-10-23T00:00:00+05:30"


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("$<span data-currency-value>138,000</span>", "$138,000"),
        ("₹ <span data-currency-value>50,000</span>", "₹50,000"),
        ("$<span data-currency-value>0</span>", None),
        (None, None),
    ],
)
def test_clean_prize(html, expected):
    assert clean_prize(html) == expected


def test_content_hash_ignores_raw():
    a = EventRecord("devpost", "1", "u", "T", raw={"time_left_to_submission": "9 days left"})
    b = EventRecord("devpost", "1", "u", "T", raw={"time_left_to_submission": "8 days left"})
    c = EventRecord("devpost", "1", "u", "T2")
    assert a.content_hash() == b.content_hash() != c.content_hash()
