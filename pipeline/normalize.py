"""Common event shape and shared parsing helpers.

Dates are IST and come from source data only (D-014).
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

# "Aug 31 - Oct 23, 2026" | "Oct 12 - 24, 2026" | "Dec 15, 2026 - Jan 10, 2027" | "Oct 14, 2026"
_RANGE_RE = re.compile(
    r"^(?P<m1>[A-Z][a-z]{2}) (?P<d1>\d{1,2})(?:, (?P<y1>\d{4}))?"
    r"(?: - (?:(?P<m2>[A-Z][a-z]{2}) )?(?P<d2>\d{1,2}), (?P<y2>\d{4}))?$"
)
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class EventRecord:
    """One listing from one source, mapped to the common event shape."""

    source: str
    source_id: str
    url: str
    title: str
    organizer: str | None = None
    mode: str | None = None  # online | offline | hybrid
    city: str | None = None
    country: str | None = None
    reg_deadline: datetime | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    submission_deadline: datetime | None = None
    prize_text: str | None = None
    themes: tuple[str, ...] = ()
    eligibility: str | None = None
    team_size: str | None = None
    invite_only: bool = False
    entry_fee: str | None = None  # paid registration, e.g. '₹200'
    registrations: int | None = field(default=None, compare=False)  # changes daily, not hashed
    raw: dict = field(default_factory=dict, compare=False, repr=False)

    def content_hash(self) -> str:
        """Hash of normalized fields only; volatile fields ("9 days left", counts) don't count."""
        fields = asdict(self)
        fields.pop("raw")
        fields.pop("registrations")
        blob = json.dumps(fields, sort_keys=True, default=str, ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()


def ist_day_start(d: date) -> datetime:
    """Date-only source values are stored as 00:00 IST of that day."""
    return datetime.combine(d, time.min, IST)


def parse_date_range(text: str) -> tuple[date, date] | None:
    """Parse Devpost-style display ranges. Returns None if the format is unknown."""
    m = _RANGE_RE.match(text.strip())
    if not m:
        return None
    y2 = int(m["y2"] or m["y1"])
    m1 = MONTHS[m["m1"]]
    if m["d2"] is None:  # single date
        d = date(int(m["y1"]), m1, int(m["d1"]))
        return d, d
    m2 = MONTHS[m["m2"]] if m["m2"] else m1
    end = date(y2, m2, int(m["d2"]))
    # Year of the start: explicit, else same as end unless the range wraps a new year.
    y1 = int(m["y1"]) if m["y1"] else (y2 - 1 if m1 > m2 else y2)
    return date(y1, m1, int(m["d1"])), end


def clean_prize(html: str | None) -> str | None:
    """'$<span data-currency-value>138,000</span>' -> '$138,000'. Zero or empty -> None."""
    if not html:
        return None
    text = re.sub(r"\s+", "", _TAG_RE.sub("", html))
    if not text or not re.search(r"[1-9]", text):
        return None
    return text
