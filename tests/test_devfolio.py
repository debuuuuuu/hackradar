import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

from pipeline.sources.base import PoliteClient
from pipeline.sources.devfolio import Devfolio

# 4 real listings from 2026-10-15 (in-person, online, abroad, state-only); contact_email removed.
FIXTURE = Path(__file__).parent / "fixtures" / "devfolio" / "hackathons.json"


def fetch(pages: dict[int, dict]):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow:\n")
        return httpx.Response(200, json=pages[int(request.url.params["page"])])

    with PoliteClient(min_interval=0, transport=httpx.MockTransport(handler)) as client:
        return Devfolio().fetch(client)


def by_slug():
    page = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return {r.url.split("//")[1].split(".")[0]: r for r in fetch({1: page})}


def test_in_person_event_maps_real_registration_deadline():
    r = by_slug()["hackonhills8"]
    assert r.url == "https://hackonhills8.devfolio.co/"
    assert (r.mode, r.city, r.country) == ("offline", "Hamirpur", "India")
    assert r.reg_deadline == datetime(2026, 10, 15, 18, 29, tzinfo=UTC)  # 23:59 IST
    assert r.start_date == datetime(2026, 10, 31, 6, 30, tzinfo=UTC)
    assert r.team_size == "2-4" and r.registrations == 3186
    assert r.organizer is None and r.prize_text is None  # not in the listing


def test_online_event_has_no_place_and_state_is_the_city_fallback():
    events = by_slug()
    assert (events["arkiv"].mode, events["arkiv"].city, events["arkiv"].country) == (
        "online",
        None,
        None,
    )
    assert events["hacker-house-goa-2026"].city == "Goa"  # city is null, state is Goa


def test_organiser_email_is_never_stored():
    for r in by_slug().values():
        assert "contact_email" not in r.raw["hackathon_setting"]
        assert "@" not in json.dumps(r.raw["hackathon_setting"])


def test_fetch_follows_pages_and_skips_bad_items():
    page = json.loads(FIXTURE.read_text(encoding="utf-8"))
    good, bad = page["result"][0], {"uuid": "broken", "slug": "x"}  # no name -> unparseable
    records = fetch(
        {
            1: {"result": [good], "count": 2, "pages": 2},
            2: {"result": [bad], "count": 2, "pages": 2},
        }
    )
    assert [r.title for r in records] == [good["name"].strip()]
