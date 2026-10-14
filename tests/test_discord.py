from datetime import datetime

import httpx

from pipeline.digest import Digest, DigestItem
from pipeline.normalize import IST
from pipeline.notify import discord


def item(**kw) -> DigestItem:
    base = dict(
        title="Hack [AI] *2026*",
        url="https://unstop.com/hackathons/x-1",
        deadline=datetime(2026, 10, 18, tzinfo=IST),
        deadline_kind="submit",
        mode="online",
        city=None,
        prize_text="₹12,000",
        source="unstop",
    )
    return DigestItem(**(base | kw))


def digest(**kw) -> Digest:
    base = dict(day="2026-10-15", new=[], new_total=0, closing=[], closing_total=0, open_total=300)
    return Digest(**(base | kw))


def test_format_item_escapes_markdown_and_shows_details():
    line = discord.format_item(item())
    assert line.startswith(r"**[Hack \[AI\] \*2026\*](https://unstop.com/hackathons/x-1)**")
    assert "submit by 18 Oct · Online · ₹12,000 · unstop" in line


def test_deadline_shows_time_only_when_known():
    exact = item(deadline=datetime(2026, 11, 15, 18, 1, tzinfo=IST), deadline_kind="reg")
    assert discord.format_deadline(exact) == "reg closes 15 Nov, 6:01 PM"
    assert discord.format_deadline(item(deadline=None)) == "no deadline listed"


def test_offline_and_hybrid_location():
    assert " · Agra · " in discord.format_item(item(mode="offline", city="Agra"))
    assert " · Hybrid · Agra · " in discord.format_item(item(mode="hybrid", city="Agra"))


def test_render_nothing_new():
    payload = discord.render(digest())
    assert "Nothing new today" in payload["content"]
    assert "embeds" not in payload


def test_render_sections_with_more_line():
    payload = discord.render(digest(new=[item()], new_total=12, closing=[item()], closing_total=1))
    new, closing = payload["embeds"]
    assert new["title"] == "🆕 New (12)"
    assert new["description"].endswith("*…and 11 more*")
    assert closing["title"].startswith("⏰ Closing within 3 days (1)")
    assert payload["allowed_mentions"] == {"parse": []}


def test_render_stays_under_discord_limits():
    long = [item(title="X" * 250) for _ in range(10)]
    payload = discord.render(digest(new=long, new_total=500, closing=long, closing_total=500))
    total = sum(len(e["title"]) + len(e["description"]) for e in payload["embeds"])
    assert all(len(e["description"]) <= 4096 for e in payload["embeds"])
    assert total <= 6000


def test_send_retries_after_429():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(429, json={"retry_after": 0.01})
        return httpx.Response(204)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        discord.send("https://discord.com/api/webhooks/1/abc", {"content": "hi"}, client)
    assert len(calls) == 2
