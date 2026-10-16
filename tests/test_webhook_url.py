"""A user-pasted Discord webhook must be a real Discord webhook, and nothing else (SSRF guard)."""

import pytest

from pipeline.notify.webhook_url import is_discord_webhook, redact


@pytest.mark.parametrize(
    "url",
    [
        "https://discord.com/api/webhooks/123456789012345678/abc_DEF-123",
        "https://discordapp.com/api/webhooks/123/token",
    ],
)
def test_accepts_discord_webhooks(url: str) -> None:
    assert is_discord_webhook(url)


@pytest.mark.parametrize(
    "url",
    [
        "",
        "http://discord.com/api/webhooks/1/tok",  # not https
        "https://evil.com/api/webhooks/1/tok",  # wrong host
        "https://discord.com.evil.com/api/webhooks/1/tok",  # host suffix trick
        "https://discord.com/api/webhooks/abc/tok",  # id not digits
        "https://discord.com/api/webhooks/1/",  # no token
        "https://discord.com/api/webhooks/1/tok/extra",  # extra path
        "https://169.254.169.254/latest/meta-data",  # cloud metadata address
        "https://discord.com/api/webhooks/1/tok?wait=true",  # query string
    ],
)
def test_rejects_anything_else(url: str) -> None:
    assert not is_discord_webhook(url)


def test_redact_hides_token_in_text() -> None:
    url = "https://discord.com/api/webhooks/1/SECRETTOKEN"
    msg = f"POST failed for {url}: 404"
    out = redact(msg)
    assert "SECRETTOKEN" not in out
    assert "404" in out


def test_redact_hides_callmebot_key() -> None:
    msg = "GET https://api.callmebot.com/whatsapp.php?phone=+91&apikey=ABC123 failed"
    assert "ABC123" not in redact(msg)


@pytest.mark.parametrize(
    "url",
    [
        "https://x@discord.com/api/webhooks/1/tok",  # userinfo
        "https://discord.com:443/api/webhooks/1/tok",  # explicit port
        "https://DISCORD.com/api/webhooks/1/tok",  # uppercase host
        "https://discord.com./api/webhooks/1/tok",  # trailing dot
        "https://discord.com/api/webhooks/1/tok#frag",  # fragment
        "https://discord.com/api/webhooks/\u0661/tok",  # Arabic-Indic digit id
        " https://discord.com/api/webhooks/1/tok",  # leading space
        "https://discord.com/api/webhooks/1/tok\n",  # trailing newline
        "https://discord.com/api/webhooks/1/to\tk",  # embedded tab
        "https://discord%2Ecom/api/webhooks/1/tok",  # encoded host
    ],
)
def test_rejects_non_canonical_forms(url: str) -> None:
    assert not is_discord_webhook(url)


@pytest.mark.parametrize(
    "text",
    [
        "/API/WEBHOOKS/1/SECRETTOK",
        "https%3A%2F%2Fdiscord.com%2Fapi%2Fwebhooks%2F1%2FSECRETTOK",
        "https%253A%252F%252Fdiscord.com%252Fapi%252Fwebhooks%252F1%252FSECRETTOK",
        "APIKEY=SECRETTOK",
        "ApiKey=SECRETTOK",
        "apikey%3DSECRETTOK",
    ],
)
def test_redact_handles_case_and_encoding(text: str) -> None:
    assert "SECRETTOK" not in redact(text)
