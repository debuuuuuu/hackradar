import json
from pathlib import Path

import httpx

from pipeline.sources.base import PoliteClient
from pipeline.sources.unstop import Unstop, prize_total

# 8 real items from 2026-10-14 (HTML `details` field removed), chosen to cover each variant.
FIXTURE = Path(__file__).parent / "fixtures" / "unstop" / "open_hackathons_2026-10-14.json"
ROBOTS = "User-agent: *\nAllow: /api/public/*\nDisallow: /api/*\n"


def fetch_with(pages: dict[int, dict]) -> tuple[list, list[str]]:
    requested = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=ROBOTS)
        requested.append(str(request.url))
        return httpx.Response(200, json=pages[int(request.url.params["page"])])

    transport = httpx.MockTransport(handler)
    with PoliteClient(min_interval=0, transport=transport) as client:
        return Unstop().fetch(client), requested


def test_parses_real_fixture():
    records, requested = fetch_with({1: json.loads(FIXTURE.read_text(encoding="utf-8"))})
    assert len(records) == 8
    assert all("/api/public/" in u and "per_page=100" in u for u in requested)
    by_id = {r.source_id: r for r in records}

    hybrid = by_id["1770284"]
    assert hybrid.mode == "hybrid"
    assert (hybrid.city, hybrid.country) == ("Agra", "India")
    assert hybrid.reg_deadline.isoformat() == "2026-11-15T00:00:00+05:30"
    assert hybrid.end_date.isoformat() == "2026-11-21T18:01:00+05:30"
    assert hybrid.team_size == "2-4"
    assert hybrid.prize_text is None
    assert hybrid.url.startswith("https://unstop.com/hackathons/")
    assert "Software Development" in hybrid.themes

    online = by_id["1770422"]
    assert online.mode == "online" and online.city is None and online.country is None
    assert online.team_size == "1"

    assert by_id["1767954"].prize_text == "₹12,000"  # 5,000 + 4,000 + 3,000
    assert by_id["1759619"].prize_text == "$100,000"  # second prize has no cash
    assert by_id["1768100"].prize_text is None  # prizes listed, none in cash
    assert by_id["1759619"].eligibility == "School Students"
    assert by_id["1770355"].eligibility == "Engineering Students, Postgraduate, Undergraduate"


def test_paginates_by_last_page_and_dedupes():
    item = json.loads(FIXTURE.read_text(encoding="utf-8"))["data"]["data"][0]

    def page(n: int, items: list) -> dict:
        return {"data": {"current_page": n, "last_page": 2, "total": 999, "data": items}}

    records, requested = fetch_with({1: page(1, [item]), 2: page(2, [item])})
    assert len(requested) == 2  # stops at last_page despite total=999
    assert len(records) == 1  # same id on two pages counted once


def test_prize_total_mixed_currencies():
    prizes = [
        {"cash": 100, "currency": "fa-dollar"},
        {"cash": 5000, "currency": "fa-rupee"},
        {"cash": 2000, "currency": "fa-rupee"},
        {"cash": None, "currency": "fa-rupee"},
    ]
    assert prize_total(prizes) == "$100 + ₹7,000"
