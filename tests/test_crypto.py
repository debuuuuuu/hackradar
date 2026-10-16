"""Cross-language check: ciphertext made by web/server/crypto.ts must decrypt here."""

import base64
import json
from pathlib import Path

import pytest

from pipeline.crypto import blind_index, decrypt, key_from_env

FIXTURE = Path(__file__).parent / "fixtures" / "crypto" / "ts_v1.json"
DATA = json.loads(FIXTURE.read_text(encoding="utf-8"))
KEY = base64.b64decode(DATA["key_b64"])


@pytest.mark.parametrize("case", DATA["cases"], ids=lambda c: c["plain"][:12])
def test_decrypts_typescript_ciphertext(case: dict) -> None:
    assert decrypt(case["blob"], KEY) == case["plain"]


def test_blind_index_matches_typescript() -> None:
    assert blind_index("  Debji@Example.com ", KEY) == DATA["blind_index_email"]


def test_tampered_ciphertext_raises() -> None:
    blob = DATA["cases"][0]["blob"]
    head, rest = blob[:-4], blob[-4:]
    tampered = head + ("AAAA" if rest != "AAAA" else "BBBB")
    with pytest.raises(ValueError):
        decrypt(tampered, KEY)


def test_wrong_key_raises() -> None:
    with pytest.raises(ValueError):
        decrypt(DATA["cases"][0]["blob"], bytes(32))


def test_unknown_format_raises() -> None:
    with pytest.raises(ValueError):
        decrypt("v2:a:b:c", KEY)


def test_key_from_env_requires_32_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEST_KEY_OK", base64.b64encode(bytes(32)).decode())
    monkeypatch.setenv("TEST_KEY_BAD", base64.b64encode(bytes(31)).decode())
    assert key_from_env("TEST_KEY_OK") == bytes(32)
    with pytest.raises(ValueError):
        key_from_env("TEST_KEY_BAD")
