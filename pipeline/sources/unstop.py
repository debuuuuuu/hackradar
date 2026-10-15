"""Unstop: public search API. robots.txt allows /api/public/* only (checked 2026-10-14).

Never touch other /api/* paths or /competitions/*/register (disallowed).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from pipeline.normalize import EventRecord, team_size_text
from pipeline.sources.base import PoliteClient, Source

log = logging.getLogger(__name__)

API_URL = "https://unstop.com/api/public/opportunity/search-result"
PER_PAGE = 100
MAX_PAGES = 20  # safety cap
CURRENCY = {"fa-rupee": "₹", "fa-dollar": "$"}


class Unstop(Source):
    name = "unstop"

    def fetch(self, client: PoliteClient) -> list[EventRecord]:
        # Keyed by id: pages can overlap if listings shift mid-fetch.
        items: dict[int, dict[str, Any]] = {}
        for page in range(1, MAX_PAGES + 1):
            data = client.get_json(
                API_URL,
                params={
                    "opportunity": "hackathons",
                    "oppstatus": "open",
                    "per_page": PER_PAGE,
                    "page": page,
                },
                headers={"Accept": "application/json"},
            )["data"]
            for item in data["data"]:
                items[item["id"]] = item
            # Pages often hold fewer than per_page and `total` overcounts, so trust last_page only.
            if page >= data["last_page"]:
                break
        records = []
        for item in items.values():
            try:
                records.append(parse(item))
            except Exception:
                log.exception("unstop: skipping unparseable item %s", item.get("id"))
        return records


def parse(item: dict[str, Any]) -> EventRecord:
    regn = item.get("regnRequirements") or {}
    address = item.get("address_with_country_logo") or {}
    mode = item.get("region") if item.get("region") in ("online", "offline", "hybrid") else None
    in_person = mode in ("offline", "hybrid")
    eligible = [f["name"] for f in item.get("filters") or () if f.get("type") == "eligible"]
    themes = [w["name"] for w in item.get("workfunction") or ()]
    themes += [s["skill_name"] for s in item.get("required_skills") or () if s.get("skill_name")]

    return EventRecord(
        source="unstop",
        source_id=str(item["id"]),
        url=item["seo_url"],
        title=item["title"].strip(),
        organizer=(item.get("organisation") or {}).get("name"),
        mode=mode,
        city=(address.get("city") or None) if in_person else None,
        country=((address.get("country") or {}).get("name")) if in_person else None,
        reg_deadline=_ts(regn.get("end_regn_dt")),
        end_date=_ts(item.get("end_date")),
        prize_text=prize_total(item.get("prizes") or ()),
        themes=tuple(dict.fromkeys(themes)),  # dedupe, keep order
        eligibility=", ".join(eligible) or None,
        team_size=team_size_text(regn.get("min_team_size"), regn.get("max_team_size")),
        entry_fee=entry_fee(item),
        registrations=item.get("registerCount"),
        raw=item,
    )


def entry_fee(item: dict[str, Any]) -> str | None:
    """Required registration fee from `isPaid` + `payment_services[].amount` (no currency; INR)."""
    if not item.get("isPaid"):
        return None
    services = item.get("payment_services") or ()
    amounts = sorted({int(p["amount"]) for p in services if p.get("amount")})
    if not amounts:
        return "paid"
    return f"₹{amounts[0]:,}" if len(amounts) == 1 else f"₹{amounts[0]:,}–₹{amounts[-1]:,}"


def prize_total(prizes) -> str | None:
    """Sum cash per currency: '₹12,000' or '$100,000 + ₹5,000'. Non-cash prizes → None."""
    totals: dict[str, int] = {}
    for p in prizes:
        if p.get("cash"):
            symbol = CURRENCY.get(p.get("currency"), "")
            totals[symbol] = totals.get(symbol, 0) + int(p["cash"])
    return " + ".join(f"{sym}{amount:,}" for sym, amount in totals.items()) or None


def _ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None
