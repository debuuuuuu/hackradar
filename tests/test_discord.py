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
        organizer="Hack Club",
    )
    return DigestItem(**(base | kw))


def digest(**kw) -> Digest:
    base = dict(day="2026-10-15", new=[], new_total=0, closing=[], closing_total=0, open_total=300)
    return Digest(**(base | kw))


def test_format_item_escapes_markdown_and_shows_details():
    line = discord.format_item(item())
    assert line.startswith(r"**[Hack \[AI\] \*2026\*](https://unstop.com/hackathons/x-1)**")
    assert "submit by 18 Oct · Online · ₹12,000 · unstop" in line


def test_trust_signals():
    clean = discord.format_item(item(registrations=1234))
    assert "by Hack Club · submit by 18 Oct" in clean
    assert "👥 1,234" in clean
    assert clean.count("\n") == 1  # no flag line when nothing to flag

    risky = item(organizer=None, entry_fee="₹350", invite_only=True, dates_suspect=True)
    flags = discord.format_item(risky).split("\n")[2]
    assert flags == (
        "💰 ₹350 entry fee · 🔒 invite-only · ⚠️ no organiser listed"
        " · ⚠️ dates look inconsistent, check the page"
    )
    assert discord.trust_flags(item(entry_fee="paid")) == ["💰 paid entry"]


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


def test_summary_shown_italic_and_truncated():
    line = discord.format_item(item(summary="Build *fast*. " + "x" * 300))
    summary = line.split("\n")[2]
    assert summary.startswith(r"*Build \*fast\*. ") and summary.endswith("…*")
    assert len(summary) <= discord.SUMMARY_MAX + 10


def test_header_says_how_many_far_events_are_hidden():
    payload = discord.render(digest(new=[item()], new_total=1, far_hidden=7, radius_km=150))
    assert "7 in-person events farther than 150 km hidden" in payload["content"]
    assert "hidden" not in discord.render(digest(new=[item()], new_total=1))["content"]


def test_render_contests_section():
    payload = discord.render(digest(contests=[item()], contests_total=1))
    assert payload["embeds"][0]["title"] == "🧩 Contests & other (1)"
    assert not digest(contests_total=1).empty


def test_listed_on_several_platforms_badge():
    assert discord.trust_flags(item(platforms=("devpost", "unstop"))) == [
        "✅ listed on devpost + unstop"
    ]
    assert discord.trust_flags(item(platforms=("unstop",))) == []


def test_url_cannot_break_the_markdown_link():
    line = discord.format_item(item(url="https://x.com/a (b)"))
    assert line.startswith(r"**[Hack \[AI\] \*2026\*](https://x.com/a%20(b%29)**")


def test_picks_block_comes_first_with_why_and_clash_marker():
    ok = item(title="Fits", why="matches your AI topics")
    bad = item(title="Clashy", why="good fit", clash="Exams *week*")
    payload = discord.render(digest(new=[item()], new_total=1, picks=[ok, bad]))
    embeds = payload["embeds"]
    assert embeds[0]["title"].startswith("⭐ Picked for you")
    text = embeds[0]["description"]
    assert "matches your AI topics" in text
    assert "~~" in text and r"Clashes with Exams \*week\*" in text
    assert text.index("Fits") < text.index("Clashy")
    assert embeds[1]["title"].startswith("🆕 New")


def test_no_picks_renders_as_before():
    payload = discord.render(digest(new=[item()], new_total=1))
    assert [e["title"] for e in payload["embeds"]] == ["🆕 New (1)"]


def test_more_count_excludes_rendered_picks():
    new = [item(title=f"N{n}", url=f"https://x.test/{n}", event_id=n) for n in range(10)]
    picks = [item(title=f"N{n}", url=f"https://x.test/{n}", event_id=n) for n in range(3)]
    payload = discord.render(digest(new=new, new_total=12, picks=picks))
    assert payload["embeds"][1]["description"].endswith("*…and 2 more*")


def test_picks_that_do_not_fit_stay_in_the_lists():
    long = "w " * 300
    new = [
        item(
            title=f"N{n}", url=f"https://x.test/{n}", event_id=n, summary=long, why=long, clash="X"
        )
        for n in range(5)
    ]
    payload = discord.render(digest(new=new, new_total=5, picks=list(new)))
    assert sum(len(e["description"]) for e in payload["embeds"]) <= discord.EMBEDS_TOTAL_BUDGET
    picks_desc = payload["embeds"][0]["description"]
    new_desc = payload["embeds"][1]["description"]
    for n in range(5):
        in_picks = f"[N{n}](" in picks_desc
        in_new = f"[N{n}](" in new_desc
        assert in_picks != in_new or (not in_picks and "more" in new_desc)
