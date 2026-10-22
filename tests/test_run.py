import json
from datetime import UTC, datetime

from pipeline.run import last_run_payload, write_last_run


def test_ist_date_rolls_over_after_1830_utc():
    # Cron fires 23:17 UTC; in IST that's already the next day (D-018).
    now = datetime(2026, 10, 14, 23, 17, tzinfo=UTC)
    payload = last_run_payload(7, "schedule", "success", now)
    assert payload["ist_date"] == "2026-10-15"
    assert payload["finished_at_utc"] == "2026-10-14T23:17:00+00:00"


def test_write_last_run_creates_dir(tmp_path):
    path = tmp_path / "data" / "last_run.json"
    write_last_run({"status": "success"}, path)
    assert json.loads(path.read_text()) == {"status": "success"}


class _AliveConn:
    def execute(self, sql):
        return self


def test_ensure_alive_keeps_a_working_connection_and_replaces_a_dropped_one(monkeypatch):
    import psycopg

    from pipeline import run

    alive = _AliveConn()
    assert run.ensure_alive(alive) is alive

    class Dropped:
        def execute(self, sql):
            raise psycopg.OperationalError("server closed the connection")

    fresh = object()
    monkeypatch.setattr(run.db, "connect", lambda: fresh)
    assert run.ensure_alive(Dropped()) is fresh


def test_main_scores_after_enrichment_and_before_user_digests(monkeypatch, tmp_path):
    from contextlib import nullcontext

    from pipeline import run

    order = []
    monkeypatch.setattr(run, "load_dotenv", lambda: None)
    monkeypatch.setattr(run, "guard_http_logs", lambda: None)
    monkeypatch.setattr(run, "write_last_run", lambda payload: None)
    monkeypatch.setattr(run.db, "connect", lambda: nullcontext(_AliveConn()))
    monkeypatch.setattr(run.db, "start_run", lambda conn, trigger: 1)
    monkeypatch.setattr(run.db, "finish_run", lambda *a: None)
    monkeypatch.setattr(run, "fetch_and_store", lambda conn: ({}, []))
    monkeypatch.setattr(run.enrich, "enrich_safely", lambda c, e: order.append("enrich"))
    monkeypatch.setattr(run.rank, "score_safely", lambda c, e: order.append("score"))
    monkeypatch.setattr(run, "send_digest", lambda c, r, e: 0)
    monkeypatch.setattr(run, "send_user_digests", lambda c, e: order.append("users") or 0)
    assert run.main() == 0
    assert order == ["enrich", "score", "users"]
