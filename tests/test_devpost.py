import json
from pathlib import Path

import httpx
import pytest

from pipeline.sources.base import PoliteClient, RobotsDisallowed
from pipeline.sources.devpost import Devpost

FIXTURE = Path(__file__).parent / "fixtures" / "devpost" / "open_page2_2026-10-14.json"


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def make_client(handler) -> PoliteClient:
    return PoliteClient(min_interval=0, max_retries=2, transport=httpx.MockTransport(handler))


def test_parses_real_fixture():
    data = load_fixture()
    data["meta"]["total_count"] = len(data["hackathons"])  # fixture is page 2 of 48; serve it alone

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow:\n")
        return httpx.Response(200, json=data)

    with make_client(handler) as client:
        records = Devpost().fetch(client)

    assert len(records) == 8
    by_id = {r.source_id: r for r in records}

    stanford = by_id["31124"]  # 'Sep 20 - Oct 18, 2026', Stanford University, $2,700
    assert stanford.mode == "offline"
    assert stanford.city == "Stanford University"
    assert stanford.start_date.isoformat() == "2026-09-20T00:00:00+05:30"
    assert stanford.submission_deadline.isoformat() == "2026-10-18T00:00:00+05:30"
    assert stanford.prize_text == "$2,700"

    dc = by_id["31218"]  # 'Oct 12 - 24, 2026'
    assert dc.submission_deadline.date().isoformat() == "2026-10-24"

    invite = by_id["31626"]  # online, $0, invite only
    assert invite.mode == "online" and invite.city is None
    assert invite.prize_text is None
    assert invite.invite_only is True
    assert all(r.url.startswith("https://") and r.title for r in records)


def test_paginates_until_total_count():
    items = load_fixture()["hackathons"]
    pages = {1: items[:5], 2: items[5:]}
    seen_pages = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        page = int(request.url.params["page"])
        seen_pages.append(page)
        assert request.url.params["per_page"] == "40"
        return httpx.Response(200, json={"hackathons": pages[page], "meta": {"total_count": 8}})

    with make_client(handler) as client:
        assert len(Devpost().fetch(client)) == 8
    assert seen_pages == [1, 2]


def test_retries_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"hackathons": [], "meta": {"total_count": 0}})

    with make_client(handler) as client:
        assert Devpost().fetch(client) == []
    assert calls["n"] == 2


def test_respects_robots_disallow():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /api/\n")
        raise AssertionError("must not fetch a disallowed URL")

    with make_client(handler) as client, pytest.raises(RobotsDisallowed):
        Devpost().fetch(client)


def test_sends_user_agent():
    agents = []

    def handler(request: httpx.Request) -> httpx.Response:
        agents.append(request.headers["user-agent"])
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, json={"hackathons": [], "meta": {"total_count": 0}})

    with make_client(handler) as client:
        Devpost().fetch(client)
    assert agents and all(a.startswith("HackRadarBot/") for a in agents)


def test_robots_wildcards_and_longest_match():
    # Real Unstop rules (2026-10-14): stdlib robotparser wrongly allows /api/private and /register.
    robots = (
        "User-agent: *\nAllow: /hackathons/\nAllow: /api/public/*\n"
        "Disallow: /api/*\nDisallow: /competitions/*/register\n"
    )
    fetched = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=robots)
        fetched.append(request.url.path)
        return httpx.Response(200, json={})

    with make_client(handler) as client:
        client.get("https://unstop.com/api/public/opportunity/search-result")
        for url in (
            "https://unstop.com/api/private/x",
            "https://unstop.com/competitions/a-1/register",
        ):
            with pytest.raises(RobotsDisallowed):
                client.get(url)
    assert fetched == ["/api/public/opportunity/search-result"]
