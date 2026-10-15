import json

from pipeline import enrich
from pipeline.ai import summarize as s
from pipeline.ai.base import AIError, Provider


class Fake(Provider):
    name = "fake"

    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, 0

    def complete(self, system, user, *, json_mode=False):
        self.calls += 1
        if self.error:
            raise self.error
        return json.dumps(self.reply)


def test_parse_reply_reads_kind_and_nulls_unknown_kind():
    reply = json.dumps(
        {
            "events": [
                {"id": 1, "kind": "hackathon", "summary": "Build apps."},
                {"id": 2, "kind": "party", "summary": "A fest."},
            ]
        }
    )
    out = s.parse_reply(reply, [1, 2])
    assert out[1] == s.Enriched("Build apps.", "hackathon")
    assert out[2] == s.Enriched("A fest.", None)


def test_summarize_pauses_between_batches_only(monkeypatch):
    monkeypatch.setattr(
        s.config, "load", lambda name: {"ai": {"batch_size": 1, "batch_pause_seconds": 7}}
    )
    reply = {"events": [{"id": 1, "kind": "other", "summary": "x."}]}
    sleeps = []
    events = [s.EventText(i, "t", None, (), None) for i in (1, 2, 3)]
    s.summarize(Fake(reply), events, sleep=sleeps.append)
    assert sleeps == [7, 7]


def test_enrich_safely_skips_without_key_and_swallows_failures(monkeypatch):
    errors: list[str] = []
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert enrich.enrich_safely(object(), errors) == 0 and errors == []

    monkeypatch.setenv("GROQ_API_KEY", "k")

    def boom(conn):
        raise AIError("down")

    monkeypatch.setattr(enrich, "enrich", boom)
    assert enrich.enrich_safely(object(), errors) == 0
    assert errors == ["enrich: AIError: down"]


def test_enrich_saves_each_batch_and_reconnects_after_a_dropped_connection(monkeypatch):
    import psycopg

    cfg = {"ai": {"batch_size": 1, "batch_pause_seconds": 0, "max_events_per_run": 9}}
    monkeypatch.setattr(enrich.config, "load", lambda name: cfg)
    events = [s.EventText(i, "t", None, (), None) for i in (1, 2)]
    monkeypatch.setattr(enrich, "pending", lambda conn, limit: events)

    class Replies(Fake):
        def complete(self, system, user, *, json_mode=False):
            eid = 1 if "id=1>" in user else 2
            return json.dumps({"events": [{"id": eid, "kind": "hackathon", "summary": "ok."}]})

    saved, fresh = [], []

    class Closable:
        def close(self):
            fresh.append("closed")

    def fake_save(conn, results):
        if conn == "old":
            raise psycopg.OperationalError("server closed the connection")
        saved.append(sorted(results))

    monkeypatch.setattr(enrich, "save", fake_save)
    monkeypatch.setattr(enrich.db, "connect", lambda: Closable())
    n = enrich.enrich("old", Replies())
    assert n == 2 and saved == [[1], [2]]
    assert fresh == ["closed"]


def test_enrich_safely_survives_a_provider_timeout(monkeypatch):
    import httpx

    def boom(conn):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setenv("GROQ_API_KEY", "x")
    monkeypatch.setattr(enrich, "enrich", boom)
    errors: list[str] = []
    assert enrich.enrich_safely(None, errors) == 0
    assert errors and "ReadTimeout" in errors[0]
