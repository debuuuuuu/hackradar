"""Devfolio: public JSON API behind devfolio.co's own listing.

robots.txt allows all on devfolio.co and api.devfolio.co; terms say nothing on automated access
(checked 2026-10-15). The listing has no organiser or prize field, so those stay empty.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from pipeline.normalize import EventRecord, team_size_text
from pipeline.sources.base import PoliteClient, Source

log = logging.getLogger(__name__)

API_URL = "https://api.devfolio.co/api/hackathons"
MAX_PAGES = 10  # safety cap; 14 events on 1 page on 2026-10-15


class Devfolio(Source):
    name = "devfolio"

    def fetch(self, client: PoliteClient) -> list[EventRecord]:
        items: dict[str, dict[str, Any]] = {}
        for page in range(1, MAX_PAGES + 1):
            data = client.get_json(API_URL, params={"filter": "application_open", "page": page})
            for item in data["result"]:
                items[item["uuid"]] = item
            if page >= data["pages"]:
                break
        records = []
        for item in items.values():
            try:
                records.append(parse(item))
            except Exception:
                log.exception("devfolio: skipping unparseable item %s", item.get("uuid"))
        return records


def parse(item: dict[str, Any]) -> EventRecord:
    setting = item.get("hackathon_setting") or {}
    online = bool(item.get("is_online"))
    sub = setting.get("subdomain") or item["slug"]
    raw = {**item, "hackathon_setting": {**setting}}
    raw["hackathon_setting"].pop("contact_email", None)  # an organiser's address: not stored
    return EventRecord(
        source="devfolio",
        source_id=item["uuid"],
        url=f"https://{sub}.devfolio.co/",
        title=item["name"].strip(),
        mode="online" if online else "offline",
        city=None if online else (item.get("city") or item.get("state") or None),
        country=None if online else item.get("country"),
        reg_deadline=_ts(setting.get("reg_ends_at")),
        start_date=_ts(item.get("starts_at")),
        end_date=_ts(item.get("ends_at")),
        themes=tuple(t["name"] for t in item.get("themes") or () if t.get("name")),
        team_size=team_size_text(item.get("team_min"), item.get("team_size")),
        registrations=item.get("participants_count"),
        raw=raw,
    )


def _ts(value: str | None) -> datetime | None:
    # "2026-10-15T18:29:00.000Z" (UTC); stored as timestamptz, shown in IST.
    return datetime.fromisoformat(value) if value else None
