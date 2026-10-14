import json

from pipeline.ai import summarize as s
from pipeline.ai.base import AIError, Provider


class Fake(Provider):
    name = "fake"

    def __init__(self, replies):
        self.replies, self.prompts = list(replies), []

    def complete(self, system, user, *, json_mode=False):
        self.prompts.append(user)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return json.dumps(r)


def ev(i, desc="<p>Build <b>agents</b> &amp; ship.</p>", themes=("AI",)):
    return s.EventText(i, f"Event {i}", "Org", themes, desc)


def test_clean_strips_html_and_truncates():
    assert s.clean("<p>Build <b>agents</b> &amp; ship.</p>") == "Build agents & ship."
    assert s.clean("x" * 2000).endswith("…") and len(s.clean("x" * 2000)) == s.TEXT_CHARS
    assert s.clean(None) == ""


def test_prompt_wraps_each_event_and_marks_missing_text():
    p = s.build_user_prompt([ev(1), ev(2, desc=None, themes=())])
    assert "<event id=1>" in p and "Build agents & ship." in p
    assert "Description: none provided" in p and "Themes: none listed" in p


def test_rules_reject_money_dates_and_long_text():
    for bad in [
        "Win ₹50,000 building apps",
        "Wins $5k",
        "Closes 24 Oct",
        "Register by Oct 24",
        "Great prize pool",
        "x" * 300,
    ]:
        assert s.violates_rules(bad), bad
    assert not s.violates_rules("Build AI agents in a day. Suits beginners with some Python.")
    assert not s.violates_rules("HackGB 2026 is a beginner hackathon on health topics.")


def test_parse_reply_keeps_valid_drops_bad_and_unknown():
    reply = json.dumps(
        {
            "events": [
                {"id": 1, "summary": "Build agents."},
                {"id": 2, "summary": "Win ₹1,00,000!"},
                {"id": 99, "summary": "Not asked for."},
                {"id": 3, "summary": 5},
                "junk",
            ]
        }
    )
    assert s.parse_reply(reply, [1, 2, 3]) == {1: s.Enriched("Build agents.", None)}


def test_summarize_batches_and_survives_a_failed_batch(monkeypatch):
    monkeypatch.setattr(s.config, "load", lambda name: {"ai": {"batch_size": 2}})
    provider = Fake(
        [
            {"events": [{"id": 1, "summary": "One."}, {"id": 2, "summary": "Two."}]},
            AIError("rate limited"),
            {"events": [{"id": 5, "summary": "Five."}]},
        ]
    )
    out = s.summarize(provider, [ev(i) for i in range(1, 6)], sleep=lambda n: None)
    assert {k: v.summary for k, v in out.items()} == {1: "One.", 2: "Two.", 5: "Five."}
    assert len(provider.prompts) == 3


def test_bad_json_reply_raises():
    try:
        s.parse_reply("not json", [1])
    except AIError:
        return
    raise AssertionError("expected AIError")


def test_parse_reply_normalises_non_breaking_hyphens():
    reply = json.dumps({"events": [{"id": 1, "summary": "A beginner‑friendly event."}]})
    assert s.parse_reply(reply, [1]) == {1: s.Enriched("A beginner-friendly event.", None)}
