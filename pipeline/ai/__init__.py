"""Swappable AI providers (D-006, D-035). Only public event text is ever sent (CLAUDE.md)."""

from __future__ import annotations

from pipeline import config
from pipeline.ai.base import AIError, Provider
from pipeline.ai.groq import Groq

PROVIDERS: dict[str, type[Provider]] = {"groq": Groq}


def get_provider(kind: str = "batch_provider") -> Provider:
    """Provider named by `ai.<kind>` in settings.yaml; unknown/unbuilt names fail loudly."""
    name = config.load("settings")["ai"][kind]
    if name not in PROVIDERS:
        raise AIError(f"AI provider '{name}' is not implemented yet (have: {sorted(PROVIDERS)})")
    return PROVIDERS[name]()


__all__ = ["AIError", "Provider", "get_provider"]
