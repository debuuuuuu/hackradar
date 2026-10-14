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
