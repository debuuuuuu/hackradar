"""SQL that writes or selects data. Needs TEST_DATABASE_URL (see conftest.py)."""

from datetime import UTC, datetime, timedelta

from pipeline import db, dedupe, digest
from pipeline.normalize import IST, EventRecord

NOW = datetime(2026, 10, 15, 12, tzinfo=UTC)
FUTURE = datetime(2026, 11, 20, tzinfo=IST)


def rec(source="unstop", sid="1", title="Alpha Hack", **kw) -> EventRecord:
    base = dict(
        source=source,
        source_id=sid,
        url=f"https://x/{source}/{sid}",
        title=title,
        organizer="Org",
        end_date=FUTURE,
    )
    return EventRecord(**(base | kw))


def status(conn, title):
    return conn.execute("SELECT status FROM events WHERE title = %s", (title,)).fetchone()[0]


def test_upsert_reports_new_same_changed_and_resets_ai_fields(conn):
    assert db.upsert_events(conn, [rec()]) == ["new"]
    assert db.upsert_events(conn, [rec()]) == ["same"]
    conn.execute("UPDATE events SET summary = 's', kind = 'hackathon'")
    assert db.upsert_events(conn, [rec(prize_text="₹5")]) == ["changed"]
    row = conn.execute("SELECT summary, kind, prize_text FROM events").fetchone()
    assert row == (None, None, "₹5")  # changed listing gets re-summarised


def test_close_past_events_keeps_today_open(conn):
    today = datetime(2026, 11, 20, tzinfo=IST)
    db.upsert_events(conn, [rec(sid="1", title="Today", end_date=today)])
    db.upsert_events(conn, [rec(sid="2", title="Old", end_date=today - timedelta(days=1))])
    assert db.close_past_events(conn, today) == 1
    assert (status(conn, "Today"), status(conn, "Old")) == ("open", "closed")


def test_close_unlisted_waits_for_grace_and_ignores_unhealthy_sources(conn):
    db.upsert_events(conn, [rec(sid="1", title="Gone"), rec(sid="2", title="Fresh")])
    db.upsert_events(conn, [rec("devpost", "9", "Devpost only")])
    conn.execute("UPDATE event_sources SET last_seen_at = now() - interval '5 days'")
    conn.execute("UPDATE event_sources SET last_seen_at = now() WHERE source_id = '2'")
    started = conn.execute("SELECT now()").fetchone()[0]
    assert db.close_unlisted_events(conn, ["unstop"], started) == 1  # devpost was down
    assert [status(conn, t) for t in ("Gone", "Fresh", "Devpost only")] == [
        "closed",
        "open",
        "open",
    ]
    db.upsert_events(conn, [rec(sid="1", title="Gone")])  # listed again, unchanged
    assert status(conn, "Gone") == "open"


def test_digest_new_uses_cutoff_and_splits_kinds(conn):
    db.upsert_events(conn, [rec(sid="1", title="Build It"), rec(sid="2", title="Quiz Night")])
    conn.execute("UPDATE events SET kind = 'contest' WHERE title = 'Quiz Night'")
    d = digest.build(conn, None, NOW)
    assert (d.new_total, d.contests_total, d.open_total) == (1, 1, 1)
    assert d.new[0].title == "Build It" and d.new[0].platforms == ("unstop",)
    later = digest.build(conn, datetime.now(UTC) + timedelta(hours=1), NOW)
    assert later.empty  # nothing first seen after the last digest


def test_dedupe_merges_across_sources_and_keeps_both_urls(conn):
    db.upsert_events(conn, [rec("devpost", "d1", "Multimodal AI Hackathon 2026")])
    db.upsert_events(conn, [rec("unstop", "u1", "Multimodal AI Hackathon 2026")])
    assert dedupe.dedupe_events(conn) == 1
    assert conn.execute("SELECT count(*) FROM events").fetchone()[0] == 1
    sources = conn.execute("SELECT source FROM event_sources ORDER BY 1").fetchall()
    assert sources == [("devpost",), ("unstop",)]
    assert db.upsert_events(conn, [rec("unstop", "u1", "Multimodal AI Hackathon 2026")]) == ["same"]
