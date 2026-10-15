"""CallMeBot WhatsApp sender (task 2.6). Tests use httpx.MockTransport only, never the real API."""

from __future__ import annotations

import logging
from datetime import datetime

import httpx
import pytest

from pipeline.digest import Digest, DigestItem
from pipeline.normalize import IST
from pipeline.notify import whatsapp

PHONE = "+15550001234"
KEY = "cmb-secret-key-987"
SITE = "https://hackradar.example"


def _sender(handler, **kw) -> whatsapp.WhatsAppSender:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return whatsapp.WhatsAppSender(client=client, **kw)


def test_sends_one_get_with_phone_key_and_text() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text="Message queued")

    _sender(handler).send_text(PHONE, KEY, "hello there")
    assert len(seen) == 1
    req = seen[0]
    assert req.method == "GET"
    assert req.url.host == "api.callmebot.com"
    assert req.url.path == "/whatsapp.php"
    assert req.url.params["phone"] == PHONE
    assert req.url.params["apikey"] == KEY
    assert req.url.params["text"] == "hello there"


def test_text_is_truncated_to_the_limit() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    _sender(handler).send_text(PHONE, KEY, "x" * (whatsapp.MAX_CHARS + 500))
    assert len(seen[0].url.params["text"]) == whatsapp.MAX_CHARS


def test_per_run_cap_stops_sends_without_a_request() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200)

    sender = _sender(handler, max_per_run=2)
    sender.send_text(PHONE, KEY, "one")
    sender.send_text(PHONE, KEY, "two")
    with pytest.raises(whatsapp.CapReached):
        sender.send_text(PHONE, KEY, "three")
    assert calls == 2


def test_http_error_raises_without_phone_or_key(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(whatsapp.WhatsAppError) as info:
            _sender(handler).send_text(PHONE, KEY, "hi")
    text = f"{info.value} {caplog.text}"
    assert "500" in str(info.value)
    assert PHONE not in text
    assert KEY not in text


def test_transport_error_raises_without_phone_or_key(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {request.url}")

    with pytest.raises(whatsapp.WhatsAppError) as info:
        _sender(handler).send_text(PHONE, KEY, "hi")
    assert PHONE not in str(info.value)
    assert KEY not in str(info.value)


def _item(title: str, deadline_day: int) -> DigestItem:
    return DigestItem(
        title=title,
        url=f"https://example.com/{title}",
        deadline=datetime(2026, 10, deadline_day, tzinfo=IST),
        deadline_kind="submit",
        mode="online",
        city=None,
        prize_text=None,
        source="devpost",
    )


def test_short_text_lists_top_items_and_site_link_only() -> None:
    items = [_item(f"Hack {n}", 20) for n in range(8)]
    digest = Digest(
        day="2026-10-16",
        new=items,
        new_total=8,
        closing=[],
        closing_total=0,
        open_total=40,
    )
    text = whatsapp.short_text(digest, SITE, top=3)
    assert "Hack 0" in text and "Hack 2" in text
    assert "Hack 3" not in text
    assert "and 5 more" in text
    assert SITE in text
    assert len(text) <= whatsapp.MAX_CHARS


def test_short_text_when_nothing_is_new_says_so() -> None:
    digest = Digest(
        day="2026-10-16", new=[], new_total=0, closing=[], closing_total=0, open_total=0
    )
    text = whatsapp.short_text(digest, SITE)
    assert "Nothing new" in text
    assert SITE in text
