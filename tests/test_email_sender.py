"""Gmail SMTP sender (task 2.7). smtplib.SMTP is replaced by a fake: no mail is ever sent."""

from __future__ import annotations

import base64
import logging
import os
from datetime import datetime
from email.message import EmailMessage

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from pipeline.digest import Digest, DigestItem
from pipeline.normalize import IST
from pipeline.notify import email as mail
from pipeline.user_digest import Recipient

PASSWORD = "app-pass-SECRET"
USER = "sender@example.com"


class FakeSMTP:
    """Records the conversation. Class-level `sent` collects every message across instances."""

    sent: list[EmailMessage] = []
    opened: list[tuple] = []
    login_error: Exception | None = None

    def __init__(self, host: str, port: int, timeout: float | None = None) -> None:
        FakeSMTP.opened.append((host, port))
        self.started_tls = False

    def __enter__(self) -> FakeSMTP:
        return self

    def __exit__(self, *exc) -> None:
        return None

    def starttls(self, context=None) -> None:
        self.started_tls = True

    def login(self, user: str, password: str) -> None:
        assert self.started_tls, "login must come after STARTTLS"
        if FakeSMTP.login_error:
            raise FakeSMTP.login_error
        assert (user, password) == (USER, PASSWORD)

    def send_message(self, msg: EmailMessage) -> None:
        FakeSMTP.sent.append(msg)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    FakeSMTP.sent = []
    FakeSMTP.opened = []
    FakeSMTP.login_error = None
    monkeypatch.setenv("SMTP_USER", USER)
    monkeypatch.setenv("SMTP_APP_PASSWORD", PASSWORD)
    monkeypatch.delenv("SITE_URL", raising=False)


def _digest() -> Digest:
    item = DigestItem(
        title="Hack Night",
        url="https://devpost.com/hack-night",
        deadline=datetime(2026, 10, 20, tzinfo=IST),
        deadline_kind="reg",
        mode="online",
        city=None,
        prize_text=None,
        source="devpost",
    )
    return Digest(
        day="2026-10-16",
        new=[item],
        new_total=1,
        closing=[],
        closing_total=0,
        open_total=5,
    )


def test_connects_to_gmail_on_587_with_starttls_and_app_password() -> None:
    mail.send_digest("friend@example.com", _digest(), smtp_factory=FakeSMTP)
    assert FakeSMTP.opened == [("smtp.gmail.com", 587)]
    assert len(FakeSMTP.sent) == 1


def test_one_message_per_recipient_addressed_only_to_them() -> None:
    mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    mail.send_digest("b@example.com", _digest(), smtp_factory=FakeSMTP)
    assert [m["To"] for m in FakeSMTP.sent] == ["a@example.com", "b@example.com"]
    for msg in FakeSMTP.sent:
        assert msg["Cc"] is None
        assert msg["Bcc"] is None
        assert msg["From"] == f"HackRadar <{USER}>"


def test_body_lists_the_event_with_its_source_link() -> None:
    mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    body = FakeSMTP.sent[0].get_body(preferencelist=("plain",)).get_content()
    assert "Hack Night" in body
    assert "https://devpost.com/hack-night" in body


def test_footer_links_settings_when_site_url_is_set(monkeypatch) -> None:
    monkeypatch.setenv("SITE_URL", "https://hackradar.example")
    mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    body = FakeSMTP.sent[0].get_body(preferencelist=("plain",)).get_content()
    assert "stop these emails" in body
    assert "https://hackradar.example/settings" in body


def test_footer_omits_link_and_logs_when_site_url_is_unset(caplog) -> None:
    with caplog.at_level(logging.INFO):
        mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    body = FakeSMTP.sent[0].get_body(preferencelist=("plain",)).get_content()
    assert "stop these emails" in body
    assert "hackradar" not in body
    assert "SITE_URL not set" in caplog.text


def test_missing_credentials_send_nothing(monkeypatch) -> None:
    monkeypatch.delenv("SMTP_APP_PASSWORD")
    with pytest.raises(mail.EmailError):
        mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    assert FakeSMTP.opened == []


def test_auth_failure_does_not_leak_the_password(caplog) -> None:
    import smtplib

    FakeSMTP.login_error = smtplib.SMTPAuthenticationError(535, f"bad {PASSWORD}".encode())
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(mail.EmailError) as info:
            mail.send_digest("a@example.com", _digest(), smtp_factory=FakeSMTP)
    assert PASSWORD not in str(info.value)
    assert PASSWORD not in caplog.text


def _encrypt(address: str, key: bytes) -> str:
    """Build a v1 ciphertext the way web/server/crypto.ts does (AES-256-GCM, tag appended)."""
    iv = os.urandom(12)
    sealed = AESGCM(key).encrypt(iv, address.encode(), None)
    ct, tag = sealed[:-16], sealed[-16:]
    enc = [base64.b64encode(p).decode() for p in (iv, tag, ct)]
    return "v1:" + ":".join(enc)


def test_sender_decrypts_the_address_and_sends_once() -> None:
    key = os.urandom(32)
    recipient = Recipient(
        user_id=7,
        channels=("email",),
        discord_webhook_enc=None,
        email_enc=_encrypt("friend@example.com", key),
        callmebot_phone_enc=None,
        callmebot_key_enc=None,
        home_city="pune",
        radius_km=150,
        format="anything",
        priorities={},
    )
    send = mail.sender_for(key, smtp_factory=FakeSMTP)
    send(recipient, _digest())
    assert [m["To"] for m in FakeSMTP.sent] == ["friend@example.com"]


# --- HTML design and the unsubscribe link ---

# Produced by web/server/unsubscribe.ts for user 42 with a 32-byte key of 0x07. If this changes, the
# site stops accepting the links in our emails.
TS_TOKEN_42 = "42.rnp--VrN8CrcAE2pV6FROYL9gIQ5tHYunmCNu9VXMho"


def test_unsubscribe_token_matches_the_one_the_website_checks() -> None:
    from pipeline.notify.unsubscribe import unsubscribe_token

    assert unsubscribe_token(bytes([7]) * 32, 42) == TS_TOKEN_42


def test_message_is_multipart_with_html_and_unsubscribe_everywhere() -> None:
    link = "https://hackradar.example/api/auth/unsubscribe?token=42.abc"
    mail.send_digest("a@example.com", _digest(), unsub_url=link, smtp_factory=FakeSMTP)
    msg = FakeSMTP.sent[0]
    assert msg["Subject"] == "Rise and build [o_o] 1 new"
    assert msg["List-Unsubscribe"] == f"<{link}>"
    assert link in msg.get_body(preferencelist=("plain",)).get_content()
    html = msg.get_body(preferencelist=("html",)).get_content()
    assert link in html and "Hack Night" in html and "https://devpost.com/hack-night" in html


def test_html_escapes_titles_and_never_emits_a_non_http_link() -> None:
    from dataclasses import replace

    d = _digest()
    evil = replace(d.new[0], title="<script>alert(1)</script>", url="javascript:alert(1)")
    html = mail.render_html(replace(d, new=[evil]), None)
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "javascript:" not in html


def test_sender_for_builds_a_per_user_unsubscribe_link(monkeypatch) -> None:
    monkeypatch.setenv("SITE_URL", "https://hackradar.example")
    key = os.urandom(32)
    recipient = Recipient(
        user_id=7,
        channels=("email",),
        discord_webhook_enc=None,
        email_enc=_encrypt("friend@example.com", key),
        callmebot_phone_enc=None,
        callmebot_key_enc=None,
        home_city="pune",
        radius_km=150,
        format="anything",
        priorities={},
    )
    mail.sender_for(key, smtp_factory=FakeSMTP)(recipient, _digest())
    from pipeline.notify.unsubscribe import unsubscribe_url

    assert (
        unsubscribe_url("https://hackradar.example", key, 7) in FakeSMTP.sent[0]["List-Unsubscribe"]
    )
