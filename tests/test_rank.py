"""Topic keywords and the cheap shortlist (For you picks)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from pipeline import config
from pipeline.rank import shortlist, topic_hits


def test_topic_hits_title_match() -> None:
    assert topic_hits(["ai-ml"], "Gen AI Hackathon", [], None) == 1


def test_topic_hits_counts_topics_from_themes() -> None:
    assert topic_hits(["ai-ml", "web"], "Build Day", ["Machine Learning", "Web"], None) == 2


def test_topic_hits_no_topics_is_zero() -> None:
    assert topic_hits([], "Gen AI Hackathon", ["Web"], "ai") == 0


def test_topic_hits_whole_word_only() -> None:
    assert topic_hits(["ai-ml"], "Maintain the village", [], "email domain") == 0
    assert topic_hits(["ai-ml"], "Build with AI!", [], None) == 1


def test_topic_hits_phrase_summary_and_one_per_topic() -> None:
    assert topic_hits(["ai-ml"], "x", [], "Learn machine learning and LLM apps") == 1
    assert topic_hits(["web3"], "x", [], "Ship a DeFi dapp") == 1


def test_topic_hits_unknown_topic_ignored() -> None:
    assert topic_hits(["nope"], "AI", [], None) == 0


def test_topic_hits_generic_phrases_do_not_match() -> None:
    assert topic_hits(["beginner"], "National College Hackathon", [], None) == 0
    assert topic_hits(["data"], "bi-weekly meetup", [], None) == 0
    assert topic_hits(["beginner"], "First hackathon? Beginner friendly", [], None) == 1


def test_topic_keys_match_the_web_topics_list() -> None:
    ts = (Path(__file__).parents[1] / "web" / "server" / "prefs.ts").read_text(encoding="utf-8")
    listed = re.search(r"export const TOPICS = \[([^\]]*)\]", ts)
    assert listed, "TOPICS array not found in web/server/prefs.ts"
    assert set(re.findall(r'"([^"]+)"', listed.group(1))) == set(config.load("topics"))


# --- database tests -------------------------------------------------------------------------


def _event(conn, title, *, themes=(), kind="hackathon", status="open", day=1, desc=None) -> int:
    eid = conn.execute(
        "INSERT INTO events (title, themes, kind, status, reg_deadline)"
        " VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (title, list(themes), kind, status, f"2026-12-{day:02d}T00:00:00+00"),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO event_sources (event_id, source, source_id, url, raw_json, content_hash)"
        " VALUES (%s, 'devpost', %s, %s, %s, 'h')",
        (eid, f"s{eid}", f"https://x/{eid}", json.dumps({"details": desc})),
    )
    return eid


def test_shortlist_filters_orders_and_limits(conn) -> None:
    both = _event(conn, "AI for Web", day=9, desc="body text")
    soon = _event(conn, "LLM Sprint", day=2)
    late = _event(conn, "GenAI Jam", day=20)
    unenriched = _event(conn, "ML Night", kind=None, day=5)
    _event(conn, "AI Contest", kind="contest")
    _event(conn, "AI Closed", status="closed")
    _event(conn, "Pottery Meetup")

    got = shortlist(conn, ["ai-ml", "web"], 10)
    assert [e.id for e in got] == [both, soon, unenriched, late]
    assert got[0].description == "body text"
    assert got[0].title == "AI for Web"

    assert [e.id for e in shortlist(conn, ["ai-ml", "web"], 2)] == [both, soon]
    assert shortlist(conn, [], 10) == []
