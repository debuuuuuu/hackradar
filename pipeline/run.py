"""Daily pipeline entry point: python -m pipeline.run"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from pipeline import db

IST = ZoneInfo("Asia/Kolkata")
LAST_RUN_PATH = Path("data/last_run.json")

log = logging.getLogger("hackradar")


def last_run_payload(run_id: int | None, trigger: str, status: str, now: datetime) -> dict:
    return {
        "run_id": run_id,
        "trigger": trigger,
        "status": status,
        "finished_at_utc": now.astimezone(UTC).isoformat(timespec="seconds"),
        "ist_date": now.astimezone(IST).date().isoformat(),
    }


def write_last_run(payload: dict, path: Path = LAST_RUN_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    trigger = os.environ.get("GITHUB_EVENT_NAME", "local")
    run_id: int | None = None
    status = "failed"
    try:
        with db.connect() as conn:
            run_id = db.start_run(conn, trigger)
            log.info("run %s started (trigger=%s)", run_id, trigger)
            # Phase 1+: fetch → normalize → dedupe → ... → send
            source_counts: dict[str, int] = {}
            errors: list[str] = []
            status = "success"
            db.finish_run(conn, run_id, status, source_counts, errors)
        log.info("run %s finished: %s", run_id, status)
        return 0
    finally:
        write_last_run(last_run_payload(run_id, trigger, status, datetime.now(UTC)))


if __name__ == "__main__":
    raise SystemExit(main())
