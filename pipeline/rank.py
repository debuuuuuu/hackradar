"""For you picks: cheap topic shortlist (Task 3 adds the AI scoring on top)."""

from __future__ import annotations

import re
from collections.abc import Sequence
from functools import cache

import psycopg

from pipeline import config
from pipeline.ai import summarize


@cache
def _patterns() -> dict[str, re.Pattern[str]]:
    """One regex per topic, built once: whole-word, case-insensitive; phrases match as written."""
    return {
        topic: re.compile(
            r"(?<![a-z0-9])(?:" + "|".join(re.escape(k.lower()) for k in words) + r")(?![a-z0-9])"
        )
        for topic, words in config.load("topics").items()
    }


def topic_hits(
    topics: Sequence[str], title: str, event_themes: Sequence[str], summary: str | None
) -> int:
    """How many of the user's topics have at least one keyword in the event text."""
    text = " ".join([title, *event_themes, summary or ""]).lower()
    patterns = _patterns()
    return sum(1 for t in topics if t in patterns and patterns[t].search(text))


_EVENTS = """
    SELECT e.id, e.title, e.organizer, e.themes,
           (SELECT COALESCE(raw_json->>'details', raw_json->>'desc') FROM event_sources
             WHERE event_id = e.id ORDER BY first_seen_at LIMIT 1),
           e.summary
      FROM events e
     WHERE e.status = 'open' AND COALESCE(e.kind, 'hackathon') = 'hackathon'
     ORDER BY COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) NULLS LAST, e.id
"""


def shortlist(
    conn: psycopg.Connection, topics: Sequence[str], limit: int
) -> list[summarize.EventText]:
    """Open hackathons matching at least one topic: most hits first, then soonest deadline."""
    scored = []
    for eid, title, organizer, themes, desc, summary in conn.execute(_EVENTS).fetchall():
        hits = topic_hits(topics, title, themes or (), summary)
        if hits:
            scored.append((hits, summarize.EventText(eid, title, organizer, themes, desc)))
    scored.sort(key=lambda s: -s[0])  # stable: deadline order from SQL breaks ties
    return [ev for _, ev in scored[:limit]]
