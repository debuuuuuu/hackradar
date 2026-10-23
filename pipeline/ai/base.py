"""Provider interface: one method, text in, text out."""

from __future__ import annotations

from abc import ABC, abstractmethod


class AIError(RuntimeError):
    """Provider unavailable, rate-limited past retries, or returned something unusable."""


class RateLimited(AIError):
    """Rate limit or quota failure that survived retries; stop calling the provider."""


class Provider(ABC):
    name: str

    @abstractmethod
    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        """Return the reply. With json_mode it should be JSON (callers still validate it)."""
