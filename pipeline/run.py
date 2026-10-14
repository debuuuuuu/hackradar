"""Daily pipeline entry point: python -m pipeline.run"""

from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

from pipeline import config, db
from pipeline.normalize import IST, ist_day_start
from pipeline.sources.base import PoliteClient, Source
from pipeline.sources.devpost import Devpost
from pipeline.sources.unstop import Unstop

SOURCES: dict[str, type[Source]] = {"devpost": Devpost, "unstop": Unstop}
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


def enabled_sources() -> list[Source]:
    switches = config.load("sources")
    return [cls() for name, cls in SOURCES.items() if switches.get(name, {}).get("enabled")]


def fetch_and_store(conn) -> tuple[dict[str, int], list[str]]:
    """Fetch every enabled source and upsert. A failing source is logged and skipped."""
    counts: dict[str, int] = {}
    errors: list[str] = []
    with PoliteClient() as client:
        for source in enabled_sources():
            try:
                records = source.fetch(client)
            except Exception as e:
                log.exception("source %s failed", source.name)
                errors.append(f"{source.name}: {type(e).__name__}: {e}")
                counts[source.name] = 0
                continue
            outcomes = Counter(db.upsert_event(conn, rec) for rec in records)
            counts[source.name] = len(records)
            log.info("%s: %d listings %s", source.name, len(records), dict(outcomes))
    today = ist_day_start(datetime.now(IST).date())
    log.info("closed %d past events", db.close_past_events(conn, today))
    return counts, errors


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
            source_counts, errors = fetch_and_store(conn)
            # Phase 1+: digest → send
            status = "partial" if errors else "success"
            db.finish_run(conn, run_id, status, source_counts, errors)
        log.info("run %s finished: %s", run_id, status)
        return 0
    finally:
        write_last_run(last_run_payload(run_id, trigger, status, datetime.now(UTC)))


if __name__ == "__main__":
    raise SystemExit(main())
