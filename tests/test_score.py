import json
import re

import pytest

from pipeline import rank
from pipeline.ai import score as sc
from pipeline.ai.base import AIError, Provider
from pipeline.ai.summarize import EventText


class Fake(Provider):
    name = "fake"

    def __init__(self, error=None):
        self.error, self.prompts = error, []

    def complete(self, system, user, *, json_mode=False):
        self.prompts.append(user)
        if self.error:
            raise self.error
        ids = [int(i) for i in re.findall(r"<event id=(\d+)>", user)]
        return json.dumps({"events": [{"id": i, "score": 70, "reason": "Fits."} for i in ids]})


def _reply(*items):
    return json.dumps({"events": list(items)})


def test_parse_reply_keeps_valid_and_drops_bad_scores_and_unknown_ids():
    reply = _reply(
        {"id": 1, "score": 82, "reason": "Matches your AI interest."},
        {"id": 99, "score": 50, "reason": "unknown id"},
        {"id": 2, "score": "high", "reason": "x"},
        {"id": 3, "score": 101, "reason": "x"},
        {"id": 4, "score": -1, "reason": "x"},
        {"id": 5, "score": 55.5, "reason": "x"},
        {"id": 6, "score": True, "reason": "x"},
    )
    out = sc.parse_reply(reply, [1, 2, 3, 4, 5, 6])
    assert out == {1: sc.Scored(82, "Matches your AI interest.")}


def test_parse_reply_blanks_reasons_that_break_rules_but_keeps_score():
    reply = _reply(
        {"id": 1, "score": 60, "reason": "Win ₹50,000 in prizes."},
        {"id": 2, "score": 61, "reason": "Closes by 12 Nov."},
        {"id": 3, "score": 62, "reason": "x" * 161},
        {"id": 4, "score": 63, "reason": "x" * 160},
        {"id": 5, "score": 64},
    )
    out = sc.parse_reply(reply, [1, 2, 3, 4, 5])
    assert [out[i].reason for i in (1, 2, 3, 5)] == ["", "", "", ""]
    assert out[4].reason == "x" * 160
    assert [out[i].score for i in (1, 2, 3, 4, 5)] == [60, 61, 62, 63, 64]


def test_parse_reply_malformed_json_raises():
    with pytest.raises(AIError):
        sc.parse_reply("not json", [1])
    with pytest.raises(AIError):
        sc.parse_reply('{"nope": []}', [1])


def test_build_user_prompt_has_topics_titles_and_untrusted_blocks_but_no_user_info():
    events = [EventText(7, "Agent Jam", "Org", ("ai-ml",), "<b>Build agents</b>")]
    prompt = sc.build_user_prompt(["ai-ml", "web"], "online", events)
    assert "ai-ml, web" in prompt and "online" in prompt
    assert "Agent Jam" in prompt and "<event id=7>" in prompt and "</event>" in prompt
    assert "Build agents" in prompt and "<b>" not in prompt
    assert "untrusted" in sc.SYSTEM


# --- database tests -------------------------------------------------------------------------


def _event(conn, title, day=1) -> int:
    eid = conn.execute(
        "INSERT INTO events (title, themes, kind, status, reg_deadline)"
        " VALUES (%s, '{}', 'hackathon', 'open', %s) RETURNING id",
        (title, f"2026-12-{day:02d}T00:00:00+00"),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO event_sources (event_id, source, source_id, url, raw_json, content_hash)"
        " VALUES (%s, 'devpost', %s, %s, '{}', 'h')",
        (eid, f"s{eid}", f"https://x/{eid}"),
    )
    return eid


def _user(conn, name, themes, fmt="online", *, onboarded=True, digest=True) -> int:
    uid = conn.execute(
        "INSERT INTO users (name, digest_enabled, onboarded_at)"
        " VALUES (%s, %s, CASE WHEN %s THEN now() END) RETURNING id",
        (name, digest, onboarded),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO preferences (user_id, themes, format) VALUES (%s, %s, %s)",
        (uid, themes, fmt),
    )
    return uid


def _rows(conn):
    return conn.execute("SELECT user_id, event_id, score, reason, model FROM scores").fetchall()


def test_score_all_calls_once_per_group_and_never_re_scores(conn):
    ai_ev = _event(conn, "AI Sprint")
    web_ev = _event(conn, "Web Jam", day=2)
    a = _user(conn, "Alice-Secret", ["ai-ml"])
    b = _user(conn, "Bob-Secret", ["ai-ml"])
    c = _user(conn, "Cara-Secret", ["web"])
    _user(conn, "Empty-Secret", [])
    _user(conn, "Pending-Secret", ["ai-ml"], onboarded=False)
    _user(conn, "Muted-Secret", ["ai-ml"], digest=False)

    fake, sleeps = Fake(), []
    assert rank.score_all(conn, fake, sleep=sleeps.append) == 3
    assert len(fake.prompts) == 2
    assert sleeps == [30]  # between the two groups, none before the first
    assert {(r[0], r[1]) for r in _rows(conn)} == {(a, ai_ev), (b, ai_ev), (c, web_ev)}
    assert all(r[2] == 70 and r[4] == "fake" for r in _rows(conn))
    joined = "\n".join(fake.prompts)
    assert "Secret" not in joined and "user" not in joined.lower()

    assert rank.score_all(conn, fake, sleep=sleeps.append) == 0
    assert len(fake.prompts) == 2


def test_score_all_with_failing_provider_writes_nothing(conn):
    _event(conn, "AI Sprint")
    _user(conn, "A", ["ai-ml"])
    assert rank.score_all(conn, Fake(error=AIError("down")), sleep=lambda s: None) == 0
    assert _rows(conn) == []


def test_score_safely_skips_without_key_and_swallows_failures(monkeypatch):
    errors: list[str] = []
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert rank.score_safely(object(), errors) == 0 and errors == []

    monkeypatch.setenv("GROQ_API_KEY", "k")

    def boom(conn):
        raise RuntimeError("db gone")

    monkeypatch.setattr(rank, "score_all", boom)
    assert rank.score_safely(object(), errors) == 0
    assert errors == ["score: RuntimeError: db gone"]
