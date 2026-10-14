import httpx
import pytest

from pipeline import ai
from pipeline.ai.base import AIError
from pipeline.ai.groq import Groq


def make(handler, monkeypatch, sleeps=None):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return Groq(client, sleep=(sleeps.append if sleeps is not None else lambda s: None))


def ok(text="hi"):
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


def test_complete_sends_auth_json_mode_and_returns_text(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.read().decode()
        return ok('{"a": 1}')

    out = make(handler, monkeypatch).complete("sys", "usr", json_mode=True)
    assert out == '{"a": 1}'
    assert seen["auth"] == "Bearer test-key"
    assert "json_object" in seen["body"] and "usr" in seen["body"]
    assert "gpt-oss-120b" in seen["body"] and '"reasoning_effort"' in seen["body"]


def test_retries_429_honouring_retry_after(monkeypatch):
    calls, sleeps = [], []

    def handler(request):
        calls.append(1)
        return httpx.Response(429, headers={"retry-after": "3"}) if len(calls) == 1 else ok("done")

    assert make(handler, monkeypatch, sleeps).complete("s", "u") == "done"
    assert sleeps == [3.0]


def test_gives_up_after_retries(monkeypatch):
    with pytest.raises(AIError, match="still failing"):
        make(lambda r: httpx.Response(503), monkeypatch).complete("s", "u")


def test_client_error_and_bad_shape_raise(monkeypatch):
    with pytest.raises(AIError, match="HTTP 401"):
        make(lambda r: httpx.Response(401, text="bad key"), monkeypatch).complete("s", "u")
    with pytest.raises(AIError, match="unexpected response"):
        make(lambda r: httpx.Response(200, json={}), monkeypatch).complete("s", "u")


def test_missing_key_and_unknown_provider(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(AIError, match="GROQ_API_KEY"):
        Groq()
    monkeypatch.setattr(ai.config, "load", lambda name: {"ai": {"batch_provider": "gemini"}})
    with pytest.raises(AIError, match="not implemented"):
        ai.get_provider()
