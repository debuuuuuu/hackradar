"""Devpost: undocumented public JSON API used by devpost.com itself.

robots.txt allows all generic crawlers (checked 2026-10-14).
"""

from __future__ import annotations

import logging
from typing import Any

from pipeline.normalize import EventRecord, clean_prize, ist_day_start, parse_date_range
from pipeline.sources.base import PoliteClient, Source

log = logging.getLogger(__name__)

API_URL = "https://devpost.com/api/hackathons"
PER_PAGE = 40
MAX_PAGES = 25  # safety cap: 1,000 events


class Devpost(Source):
    name = "devpost"

    def fetch(self, client: PoliteClient) -> list[EventRecord]:
        items: list[dict[str, Any]] = []
        for page in range(1, MAX_PAGES + 1):
            data = client.get_json(
                API_URL, params={"status[]": "open", "per_page": PER_PAGE, "page": page}
            )
            batch = data["hackathons"]
            items.extend(batch)
            if not batch or len(items) >= data["meta"]["total_count"]:
                break
        records = []
        for item in items:
            try:
                records.append(parse(item))
            except Exception:
                log.exception("devpost: skipping unparseable item %s", item.get("id"))
        return records


def parse(item: dict[str, Any]) -> EventRecord:
    start = deadline = None
    dates = parse_date_range(item.get("submission_period_dates") or "")
    if dates:
        start, deadline = (ist_day_start(d) for d in dates)
    else:
        log.warning(
            "devpost %s: unknown date format %r", item["id"], item.get("submission_period_dates")
        )

    loc = item.get("displayed_location") or {}
    online = loc.get("icon") == "globe"
    return EventRecord(
        source="devpost",
        source_id=str(item["id"]),
        url=item["url"],
        title=item["title"].strip(),
        organizer=item.get("organization_name") or None,
        mode="online" if online else "offline",
        # Free text like "Stanford University" or "jaipur"; kept as-is for now.
        city=None if online else (loc.get("location") or "").strip() or None,
        start_date=start,
        submission_deadline=deadline,
        end_date=deadline,
        prize_text=clean_prize(item.get("prize_amount")),
        themes=tuple(t["name"] for t in item.get("themes") or ()),
        invite_only=bool(item.get("invite_only")),
        raw=item,
    )
