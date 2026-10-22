"""Daily pipeline entry point: python -m pipeline.run"""

from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from pipeline import config, crypto, db, dedupe, digest, enrich, place, rank, user_digest
from pipeline.normalize import IST, ist_day_start
from pipeline.notify import discord
from pipeline.notify import email as email_notify
from pipeline.notify.webhook_url import guard_http_logs
from pipeline.notify.whatsapp import WhatsAppSender, short_text
from pipeline.sources.base import PoliteClient, Source
from pipeline.sources.devfolio import Devfolio
from pipeline.sources.devpost import Devpost
from pipeline.sources.unstop import Unstop

SOURCES: dict[str, type[Source]] = {"devpost": Devpost, "unstop": Unstop, "devfolio": Devfolio}
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
    started = conn.execute("SELECT now()").fetchone()[0]
    with PoliteClient() as client:
        for source in enabled_sources():
            try:
                records = source.fetch(client)
            except Exception as e:
                log.exception("source %s failed", source.name)
                errors.append(f"{source.name}: {type(e).__name__}: {e}")
                counts[source.name] = 0
                continue
            try:
                outcomes = Counter(db.upsert_events(conn, records))
            except Exception as e:
                log.exception("storing %s failed", source.name)
                errors.append(f"{source.name} store: {type(e).__name__}: {e}")
                counts[source.name] = 0
                continue
            counts[source.name] = len(records)
            if not records:
                errors.append(f"{source.name}: returned 0 listings (API change or outage?)")
            log.info("%s: %d listings %s", source.name, len(records), dict(outcomes))
    today = ist_day_start(datetime.now(IST).date())
    log.info("closed %d past events", db.close_past_events(conn, today))
    healthy = [name for name, n in counts.items() if n]  # skip failed or empty sources
    log.info("closed %d unlisted events", db.close_unlisted_events(conn, healthy, started))
    try:
        log.info("merged %d cross-platform duplicates", dedupe.dedupe_events(conn))
    except Exception as e:
        log.exception("dedupe failed")
        errors.append(f"dedupe: {type(e).__name__}: {e}")
    try:
        log.info("synced %d places", place.sync_places(conn))
        log.info("geocoded %d events", place.geocode_events(conn))
    except Exception as e:
        log.exception("places/geocode failed")
        errors.append(f"places: {type(e).__name__}: {e}")
    return counts, errors


def send_digest(conn, run_id: int, errors: list[str]) -> int:
    """Build and post the Discord digest. Returns messages sent; failures are recorded."""
    since = digest.last_digest_at(conn, run_id)
    d = digest.build(conn, since, datetime.now(UTC))
    log.info("digest %s: %d new, %d closing soon", d.day, d.new_total, d.closing_total)
    webhook = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook:
        log.warning("DISCORD_WEBHOOK_URL not set; digest not sent")
        return 0
    try:
        discord.send(webhook, discord.render(d))
    except Exception as e:
        log.exception("discord send failed")
        errors.append(f"discord: {type(e).__name__}: {e}")
        return 0
    return 1


def send_user_digests(conn, errors: list[str]) -> int:
    """Per-user digests (Discord, WhatsApp, email). Skipped without ENCRYPTION_KEY; never fatal."""
    if not os.environ.get("ENCRYPTION_KEY"):
        log.warning("ENCRYPTION_KEY not set; per-user digests skipped")
        return 0
    key = crypto.key_from_env()
    wa = WhatsAppSender()
    site = os.environ.get("SITE_URL", "")

    def to_discord(r, d) -> None:
        discord.send(crypto.decrypt(r.discord_webhook_enc, key), discord.render(d))

    def to_whatsapp(r, d) -> None:
        wa.send_text(
            crypto.decrypt(r.callmebot_phone_enc, key),
            crypto.decrypt(r.callmebot_key_enc, key),
            short_text(d, site),
        )

    try:
        s = user_digest.run_user_digests(
            conn,
            datetime.now(UTC),
            {
                "discord": to_discord,
                "whatsapp": to_whatsapp,
                "email": email_notify.sender_for(key),
            },
        )
    except Exception as e:
        log.exception("user digests failed")
        errors.append(f"user digests: {type(e).__name__}")
        return 0
    if s.failed:
        errors.append(f"user digests: {s.failed} failed")
    return s.sent


def ensure_alive(conn):
    """The run's connection, or a fresh one if Neon dropped it during the long scoring wait."""
    try:
        conn.execute("SELECT 1")
        return conn
    except psycopg.OperationalError:
        log.warning("database connection lost; reconnecting")
        return db.connect()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    guard_http_logs()  # httpx logs the webhook URL, which holds the token
    trigger = os.environ.get("GITHUB_EVENT_NAME", "local")
    run_id: int | None = None
    status = "failed"
    try:
        with db.connect() as first:
            conn = first
            run_id = db.start_run(conn, trigger)
            log.info("run %s started (trigger=%s)", run_id, trigger)
            source_counts, errors = fetch_and_store(conn)
            enrich.enrich_safely(conn, errors)
            rank.score_safely(conn, errors)
            conn = ensure_alive(conn)
            try:
                sent = send_digest(conn, run_id, errors)
                sent += send_user_digests(conn, errors)
                status = "partial" if errors else "success"
                db.finish_run(conn, run_id, status, source_counts, errors, sent)
            finally:
                if conn is not first:
                    conn.close()
        log.info("run %s finished: %s", run_id, status)
        return 0
    finally:
        write_last_run(last_run_payload(run_id, trigger, status, datetime.now(UTC)))


if __name__ == "__main__":
    raise SystemExit(main())
