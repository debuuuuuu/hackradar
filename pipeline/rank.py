"""For you picks: cheap topic shortlist, then AI fit scores per topic group (D-051)."""

from __future__ import annotations

import logging
import os
import re
import time
from collections import defaultdict
from collections.abc import Collection, Sequence
from functools import cache

import psycopg

from pipeline import ai, config, db
from pipeline.ai import score as ai_score
from pipeline.ai import summarize
from pipeline.ai.base import Provider, RateLimited
from pipeline.notify.webhook_url import redact

log = logging.getLogger(__name__)


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


_CANDIDATES = """
    SELECT e.id, e.title, e.organizer, e.themes, e.summary
      FROM events e
     WHERE e.status = 'open' AND COALESCE(e.kind, 'hackathon') = 'hackathon'
     ORDER BY COALESCE(e.reg_deadline, e.submission_deadline, e.end_date) NULLS LAST, e.id
"""

_DESCRIPTIONS = """
    SELECT e.id, (SELECT COALESCE(raw_json->>'details', raw_json->>'desc') FROM event_sources
                   WHERE event_id = e.id ORDER BY first_seen_at LIMIT 1)
      FROM events e WHERE e.id = ANY(%s)
"""

# (id, title, organizer, themes, summary): open hackathons in deadline order, no long text.
Candidate = tuple[int, str, str | None, list[str], str | None]


def load_candidates(conn: psycopg.Connection) -> list[Candidate]:
    """Open hackathons without their descriptions, soonest deadline first."""
    return conn.execute(_CANDIDATES).fetchall()


def _matches(candidates: Sequence[Candidate], topics: Sequence[str]) -> list[tuple[int, Candidate]]:
    """Candidates with at least one topic hit, most hits first (stable: deadline order on ties)."""
    hit = [(topic_hits(topics, c[1], c[3] or (), c[4]), c) for c in candidates]
    return sorted(((n, c) for n, c in hit if n), key=lambda m: -m[0])


def _texts(conn: psycopg.Connection, chosen: Sequence[Candidate]) -> list[summarize.EventText]:
    """Fetch descriptions for just the chosen events."""
    desc = dict(conn.execute(_DESCRIPTIONS, ([c[0] for c in chosen],)).fetchall())
    return [summarize.EventText(c[0], c[1], c[2], c[3], desc.get(c[0])) for c in chosen]


def shortlist(
    conn: psycopg.Connection,
    topics: Sequence[str],
    limit: int,
    candidates: Sequence[Candidate] | None = None,
    skip: Collection[int] = (),
) -> list[summarize.EventText]:
    """Open hackathons matching at least one topic: most hits first, then soonest deadline.

    Events in skip (already scored) are dropped before the limit, so new events are not starved.
    """
    if candidates is None:
        candidates = load_candidates(conn)
    chosen = [c for _, c in _matches(candidates, topics) if c[0] not in skip][:limit]
    return _texts(conn, chosen)


_GROUPS = """
    SELECT u.id, p.themes, p.format
      FROM users u JOIN preferences p ON p.user_id = u.id
     WHERE u.onboarded_at IS NOT NULL AND u.digest_enabled AND cardinality(p.themes) > 0
     ORDER BY u.id
"""

_SCORED_FOR_ALL = """
    SELECT event_id FROM scores WHERE event_id = ANY(%s) AND user_id = ANY(%s)
     GROUP BY event_id HAVING count(*) = %s
"""

_UPSERT = """
    INSERT INTO scores (user_id, event_id, score, reason, model, scored_at)
    VALUES (%s, %s, %s, %s, %s, now())
    ON CONFLICT (user_id, event_id) DO UPDATE
       SET score = EXCLUDED.score, reason = EXCLUDED.reason,
           model = EXCLUDED.model, scored_at = EXCLUDED.scored_at
"""


def score_all(
    conn: psycopg.Connection,
    provider: Provider | None = None,
    sleep=time.sleep,
    monotonic=time.monotonic,
) -> int:
    """Score the topic shortlist once per (themes, format) group and store it for every user in it.

    Largest groups (most users) go first. Scoring stops starting groups after rank.max_groups AI
    calls or rank.max_seconds, and stops entirely on a rate limit; the rest wait for the next run.
    Events already scored for every user in a group are skipped, so a re-run costs no AI calls.
    A failed group is logged and skipped. Returns the number of score rows written.
    """
    users_by_group: dict[tuple[tuple[str, ...], str], list[int]] = defaultdict(list)
    for uid, themes, fmt in conn.execute(_GROUPS).fetchall():
        users_by_group[(tuple(sorted(themes)), fmt)].append(uid)
    if not users_by_group:
        return 0
    groups = sorted(users_by_group.items(), key=lambda g: (-len(g[1]), g[0]))
    cfg = config.load("settings")
    limit, pause = cfg["rank"]["shortlist"], cfg["ai"].get("batch_pause_seconds", 0)
    max_seconds, max_groups = cfg["rank"].get("max_seconds", 480), cfg["rank"].get("max_groups", 40)
    if provider is None:
        provider = ai.get_provider()
    live = {"conn": conn, "own": None}

    def on_db(fn, *args):
        """Run fn(conn, *args); Neon may drop the connection during the AI wait: reconnect once."""
        try:
            return fn(live["conn"], *args)
        except psycopg.OperationalError:
            log.warning("database connection lost during scoring; reconnecting")
            if live["own"] is not None:
                live["own"].close()
            live["own"] = live["conn"] = db.connect()
            return fn(live["conn"], *args)

    def pending(c, candidates, topics, users):
        matched = [m for _, m in _matches(candidates, topics)]
        done = {
            r[0] for r in c.execute(_SCORED_FOR_ALL, ([m[0] for m in matched], users, len(users)))
        }
        return _texts(c, [m for m in matched if m[0] not in done][:limit])

    def save(c, rows):
        with c.transaction(), c.cursor() as cur:
            cur.executemany(_UPSERT, rows)

    written, called, calls, left = 0, False, 0, 0
    started = monotonic()
    try:
        candidates = on_db(load_candidates)
        for i, ((topics, fmt), users) in enumerate(groups):
            if calls >= max_groups or monotonic() - started >= max_seconds:
                left = len(groups) - i
                break
            try:
                todo = on_db(pending, candidates, topics, users)
                if not todo:
                    continue
                if called:
                    sleep(pause)
                called = True
                calls += 1
                results = ai_score.score(provider, topics, fmt, todo)
                rows = [
                    (uid, eid, r.score, r.reason, provider.name)
                    for eid, r in results.items()
                    for uid in users
                ]
                on_db(save, rows)
                written += len(rows)
            except RateLimited as e:
                left = len(groups) - i
                log.error("scoring stopped, provider rate limited: %s", redact(str(e)))
                break
            except Exception as e:  # one bad group never stops the others
                log.error("scoring group %s failed: %s", topics, redact(f"{type(e).__name__}: {e}"))
    finally:
        if live["own"] is not None:
            live["own"].close()
    if left:
        log.warning("%d topic groups left for the next run", left)
    log.info("wrote %d scores for %d topic groups", written, len(groups))
    return written


def score_safely(conn: psycopg.Connection, errors: list[str]) -> int:
    """For run.py: skip quietly without a key, record any failure, never raise."""
    if not os.environ.get("GROQ_API_KEY"):
        log.warning("GROQ_API_KEY not set; skipping scoring")
        return 0
    try:
        # Own short-lived connection: ranking never touches the one the digests use.
        with db.connect() as own:
            return score_all(own)
    except Exception as e:  # scoring must never block the digest
        log.exception("scoring failed")
        errors.append(f"score: {type(e).__name__}: {e}")
        return 0
