"""Decrypt personal fields written by web/server/crypto.ts (AES-256-GCM, format v1)."""

import base64
import hashlib
import hmac
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def key_from_env(name: str = "ENCRYPTION_KEY") -> bytes:
    raw = os.environ.get(name)
    if not raw:
        raise ValueError(f"{name} is not set")
    key = base64.b64decode(raw)
    if len(key) != 32:
        raise ValueError(f"{name} must be base64 of exactly 32 bytes (got {len(key)})")
    return key


def decrypt(blob: str, key: bytes) -> str:
    """Raises ValueError on a malformed, tampered or wrong-key blob."""
    parts = blob.split(":")
    if len(parts) != 4 or parts[0] != "v1":
        raise ValueError("unsupported ciphertext format")
    iv, tag, ct = (base64.b64decode(p) for p in parts[1:])
    if len(iv) != 12 or len(tag) != 16:
        raise ValueError("malformed ciphertext")
    try:
        return AESGCM(key).decrypt(iv, ct + tag, None).decode("utf-8")
    except InvalidTag as exc:
        raise ValueError("decryption failed: wrong key or tampered data") from exc


def blind_index(value: str, key: bytes) -> str:
    """Same as crypto.ts blindIndex: hex HMAC-SHA256 of the trimmed, lower-cased value."""
    return hmac.new(key, value.strip().lower().encode("utf-8"), hashlib.sha256).hexdigest()
