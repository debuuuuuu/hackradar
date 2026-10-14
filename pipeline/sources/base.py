"""Source interface + polite HTTP client (D-002: clear UA, ~1 req/s/host, retries, robots.txt)."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from pipeline import config
from pipeline.normalize import EventRecord

log = logging.getLogger(__name__)

RETRY_STATUSES = {429, 500, 502, 503, 504}


class RobotsDisallowed(Exception):
    pass


class PoliteClient:
    def __init__(
        self,
        user_agent: str | None = None,
        min_interval: float | None = None,
        max_retries: int | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        http = config.load("settings")["http"]
        self.user_agent = user_agent or http["user_agent"]
        self.min_interval = http["min_interval_seconds"] if min_interval is None else min_interval
        self.max_retries = http["max_retries"] if max_retries is None else max_retries
        self._client = httpx.Client(
            headers={"User-Agent": self.user_agent},
            timeout=30,
            follow_redirects=True,
            transport=transport,
        )
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser] = {}

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> PoliteClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        if not self._allowed(url):
            raise RobotsDisallowed(url)
        return self._request(url, **kwargs)

    def get_json(self, url: str, **kwargs: Any) -> Any:
        return self.get(url, **kwargs).json()

    def _allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            parser = RobotFileParser()
            resp = self._request(f"{origin}/robots.txt", check_status=False)
            if resp.status_code >= 400:
                parser.allow_all = True  # no robots.txt → everything allowed (RFC 9309)
            else:
                parser.parse(resp.text.splitlines())
            self._robots[origin] = parser
        return self._robots[origin].can_fetch(self.user_agent, url)

    def _request(self, url: str, check_status: bool = True, **kwargs: Any) -> httpx.Response:
        host = urlsplit(url).netloc
        for attempt in range(self.max_retries + 1):
            wait = self._last_request.get(host, 0) + self.min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_request[host] = time.monotonic()
            try:
                resp = self._client.get(url, **kwargs)
            except httpx.TransportError as e:
                if attempt == self.max_retries:
                    raise
                log.warning("GET %s failed (%s), retrying", url, e)
            else:
                if resp.status_code not in RETRY_STATUSES or attempt == self.max_retries:
                    if check_status:
                        resp.raise_for_status()
                    return resp
                log.warning("GET %s -> %s, retrying", url, resp.status_code)
            time.sleep(self.min_interval * 2**attempt)
        raise AssertionError("unreachable")


class Source(ABC):
    name: str

    @abstractmethod
    def fetch(self, client: PoliteClient) -> list[EventRecord]:
        """Return all currently open listings. May raise; the runner isolates failures."""
