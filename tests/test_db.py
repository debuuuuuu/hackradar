"""SQL that writes or selects data. Needs TEST_DATABASE_URL (see conftest.py)."""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from pipeline import config, db, dedupe, digest, place
from pipeline.normalize import IST, EventRecord

MIGRATION = Path(db.__file__).parent / "migrations" / "0005_web_platform.sql"
OLD_MODELS = Path(__file__).parent / "fixtures" / "models_0004.sql"  # models.sql before 0005
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


def test_digest_new_uses_cutoff_and_splits_kinds(conn, monkeypatch):
    monkeypatch.setitem(config.load("settings")["digest"], "show_contests", True)
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


def test_digest_hides_contests_and_far_in_person_events_by_default(conn):
    near = dict(mode="offline", city="Karjat")
    db.upsert_events(conn, [rec(sid="1", title="Online One", mode="online")])
    db.upsert_events(conn, [rec(sid="2", title="Near One", **near)])
    db.upsert_events(conn, [rec(sid="3", title="Far One", mode="offline", city="West Delhi")])
    db.upsert_events(conn, [rec(sid="4", title="Unknown One", mode="offline", city="Kalyanpur")])
    db.upsert_events(conn, [rec(sid="5", title="Quiz Night", mode="online")])
    conn.execute("UPDATE events SET kind = 'contest' WHERE title = 'Quiz Night'")
    d = digest.build(conn, None, NOW)  # settings: home pune, 150 km, contests hidden
    assert sorted(i.title for i in d.new) == ["Near One", "Online One"]
    assert (d.new_total, d.far_hidden, d.contests_total) == (2, 2, 0)


def test_sync_places_loads_yaml_and_is_idempotent(conn):
    n = place.sync_places(conn)
    assert n == len(config.load("places")) > 0
    assert place.sync_places(conn) == n
    assert conn.execute("SELECT count(*) FROM places").fetchone()[0] == n
    lat, lon = conn.execute("SELECT lat, lon FROM places WHERE key = 'karjat'").fetchone()
    assert (round(lat, 2), round(lon, 2)) == (18.91, 73.32)


def test_geocode_events_sets_coordinates_for_known_cities_only(conn):
    db.upsert_events(conn, [rec(sid="1", title="Karjat One", mode="offline", city="Karjat")])
    db.upsert_events(conn, [rec(sid="2", title="Nowhere One", mode="offline", city="Kalyanpur")])
    db.upsert_events(conn, [rec(sid="3", title="Online One", mode="online", city="Karjat")])
    assert place.geocode_events(conn) == 1
    rows = dict(conn.execute("SELECT title, lat FROM events").fetchall())
    assert round(rows["Karjat One"], 2) == 18.91
    assert rows["Nowhere One"] is None and rows["Online One"] is None
    assert place.geocode_events(conn) == 1  # re-running is harmless


def test_new_preference_defaults_match_the_web_spec(conn):
    uid = conn.execute("INSERT INTO users (name) VALUES ('u') RETURNING id").fetchone()[0]
    conn.execute("INSERT INTO preferences (user_id) VALUES (%s)", (uid,))
    row = conn.execute(
        "SELECT home_city, radius_km, format, priorities, include_social, channels"
        " FROM preferences"
    ).fetchone()
    assert row == (
        "pune",
        150,
        "online_near",
        {"hackathon": "top", "contest": "normal", "workshop": "off", "fest": "off"},
        True,
        {
            "digest": ["email", "discord"],
            "ping": ["discord"],
            "reminders": ["email", "discord"],
        },
    )
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE preferences SET format = 'nope'")


NEW_COLUMNS = {
    "users": {"email_hash", "last_login_at", "onboarded_at"},
    "preferences": {
        "home_city",
        "radius_km",
        "format",
        "priorities",
        "include_social",
        "channels",
    },
    "events": {"lat", "lon"},
    "logins": {"id", "user_id", "method", "at"},
    "login_tokens": {"id", "email_hash", "token_hash", "expires_at", "used_at", "created_at"},
    "places": {"key", "name", "lat", "lon"},
}


def _columns(conn, table):
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_schema = current_schema() AND table_name = %s",
        (table,),
    ).fetchall()
    return {r[0] for r in rows}


def _assert_new_shape(conn):
    for table, cols in NEW_COLUMNS.items():
        assert cols <= _columns(conn, table), table
    conn.execute("INSERT INTO users (name, email_hash) VALUES ('a', 'h')")
    with pytest.raises(psycopg.errors.UniqueViolation):
        conn.execute("INSERT INTO users (name, email_hash) VALUES ('b', 'h')")


def test_models_sql_has_every_new_column_and_migration_applies_on_top(conn):
    _assert_new_shape(conn)
    conn.execute(MIGRATION.read_text(encoding="utf-8"))  # no-op on the current schema


def test_migration_0005_upgrades_the_previous_schema_and_is_idempotent(conn):
    # Fresh schema shaped like production before 0005 (models.sql as of 2f1fc69).
    original = conn.execute("SHOW search_path").fetchone()[0]
    schema = f"t_old_{uuid.uuid4().hex[:8]}"
    conn.execute(f"CREATE SCHEMA {schema}")
    conn.execute(f"SET search_path TO {schema}, public")
    try:
        conn.execute(OLD_MODELS.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO users (name) VALUES ('old')")
        conn.execute("INSERT INTO preferences (user_id) SELECT id FROM users")
        assert "email_hash" not in _columns(conn, "users")
        sql = MIGRATION.read_text(encoding="utf-8")
        conn.execute(sql)
        conn.execute(sql)  # second run proves idempotency
        _assert_new_shape(conn)
        # existing rows pick up the defaults
        assert conn.execute("SELECT home_city, radius_km FROM preferences").fetchone() == (
            "pune",
            150,
        )
    finally:
        conn.execute(f"SET search_path TO {original}")
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
