"""Groq (OpenAI-compatible chat completions). Free tier limits: see research/2026-10-15-groq.md."""

from __future__ import annotations

import logging
import os
import time

import httpx

from pipeline import config
from pipeline.ai.base import AIError, Provider

log = logging.getLogger(__name__)
URL = "https://api.groq.com/openai/v1/chat/completions"


class Groq(Provider):
    name = "groq"

    def __init__(self, client: httpx.Client | None = None, sleep=time.sleep) -> None:
        cfg = config.load("settings")["ai"]
        self.model = cfg["groq_model"]
        self.retries = cfg.get("max_retries", 3)
        self.max_tokens = cfg.get("max_output_tokens", 2048)
        self.effort = cfg.get("reasoning_effort", "low")
        key = os.environ.get("GROQ_API_KEY")
        if not key:
            raise AIError("GROQ_API_KEY is not set")
        self._key = key
        self._client = client or httpx.Client(timeout=60)
        self._sleep = sleep

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        body: dict = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": self.max_tokens,
            "reasoning_effort": self.effort,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {"Authorization": f"Bearer {self._key}"}
        for attempt in range(self.retries):
            resp = self._client.post(URL, json=body, headers=headers)
            if resp.status_code in (429, 500, 502, 503):
                wait = float(resp.headers.get("retry-after", 2 ** (attempt + 1)))
                log.warning("groq %s, retrying in %.1fs", resp.status_code, wait)
                self._sleep(wait)
                continue
            if resp.status_code >= 400:
                raise AIError(f"groq HTTP {resp.status_code}: {resp.text[:200]}")
            try:
                return resp.json()["choices"][0]["message"]["content"]
            except (KeyError, IndexError, ValueError) as e:
                raise AIError(f"groq: unexpected response shape: {e}") from e
        raise AIError(f"groq: still failing after {self.retries} tries (HTTP {resp.status_code})")
