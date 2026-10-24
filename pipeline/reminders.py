from __future__ import annotations

import json
import logging
from datetime import date, datetime

import psycopg

from pipeline.crypto import decrypt
from pipeline.normalize import IST

log = logging.getLogger(__name__)


def due_dates(
    status: str,
    reg_deadline: date | None,
    start_date: date | None,
    submission_deadline: date | None,
) -> list[tuple[str, date]]:
    """Return (date_field, date) pairs for which reminders should fire, given status."""
    if status == "saved":
        return [("reg_deadline", reg_deadline)] if reg_deadline else []
    if status == "registered":
        result = []
        if start_date:
            result.append(("start_date", start_date))
        if submission_deadline:
            result.append(("submission_deadline", submission_deadline))
        return result
    return []  # submitted, done, dismissed


def should_send(target: date, today: date, offset_days: int) -> bool:
    return (target - today).days == offset_days


def _send_via_channel(
    channel: str,
    title: str,
    event_url: str,
    date_field: str,
    date_value: date,
    offset_days: int,
    recipient: dict,
    enc_key: bytes,
) -> None:
    """Send a reminder via the given channel. Raises on failure."""
    from pipeline.notify import discord
    from pipeline.notify.whatsapp import WhatsAppSender

    days_label = {0: "today", 1: "tomorrow", 7: "in 7 days", 3: "in 3 days"}.get(
        offset_days, f"in {offset_days} days"
    )
    field_label = {
        "reg_deadline": "registration closes",
        "start_date": "starts",
        "submission_deadline": "submission closes",
    }.get(date_field, date_field)
    msg = (
        f"\U0001f514 Reminder: **{title}** — {field_label} {days_label}"
        f" ({date_value}).\n{event_url}"
    )

    if channel == "discord" and recipient.get("discord_webhook_enc"):
        webhook = decrypt(recipient["discord_webhook_enc"], enc_key)
        discord.send(webhook, {"content": msg})
    elif (
        channel == "whatsapp"
        and recipient.get("callmebot_phone_enc")
        and recipient.get("callmebot_key_enc")
    ):
        phone = decrypt(recipient["callmebot_phone_enc"], enc_key)
        key = decrypt(recipient["callmebot_key_enc"], enc_key)
        plain = f"\U0001f514 {title}: {field_label} {days_label}. {event_url}"
        WhatsAppSender().send_text(phone, key, plain)
    elif channel == "email" and recipient.get("email_enc"):
        from pipeline.notify import email as email_notify

        email_notify.send_reminder(
            recipient=recipient,
            enc_key=enc_key,
            title=title,
            event_url=event_url,
            date_field=date_field,
            date_value=date_value,
            offset_days=offset_days,
        )


def send_reminders(conn: psycopg.Connection, today: date, dry_run: bool = False) -> dict:
    """Send reminders for all due (user, event) pairs. Returns stats dict."""
    sent = 0
    skipped = 0
    errors: list[str] = []

    enc_key: bytes | None = None
    if not dry_run:
        try:
            from pipeline import crypto

            enc_key = crypto.key_from_env()
        except Exception:
            log.warning("ENCRYPTION_KEY not set or invalid; reminders will be dry-run only")
            dry_run = True

    rows = conn.execute("""
        SELECT
            u.id AS user_id,
            u.discord_webhook_enc,
            u.email_enc,
            u.callmebot_phone_enc,
            u.callmebot_key_enc,
            COALESCE(p.channels -> 'reminders', '["discord"]'::jsonb) AS reminder_channels,
            COALESCE(p.reminder_offsets, '{7,3,1,0}'::int[]) AS reminder_offsets,
            e.id AS event_id,
            e.title,
            e.reg_deadline,
            e.start_date,
            e.submission_deadline,
            (SELECT url FROM event_sources WHERE event_id = e.id ORDER BY id LIMIT 1) AS url,
            ue.status
        FROM user_events ue
        JOIN users u ON u.id = ue.user_id
        JOIN events e ON e.id = ue.event_id
        LEFT JOIN preferences p ON p.user_id = u.id
        WHERE ue.status IN ('saved', 'registered')
    """).fetchall()

    for row in rows:
        (
            user_id,
            discord_webhook_enc,
            email_enc,
            phone_enc,
            key_enc,
            reminder_channels_json,
            reminder_offsets,
            event_id,
            title,
            reg_deadline_ts,
            start_date_ts,
            sub_deadline_ts,
            url,
            status,
        ) = row

        def ts_to_date(ts) -> date | None:
            if ts is None:
                return None
            if isinstance(ts, datetime):
                return ts.astimezone(IST).date()
            return ts  # already a date

        reg_d = ts_to_date(reg_deadline_ts)
        start_d = ts_to_date(start_date_ts)
        sub_d = ts_to_date(sub_deadline_ts)

        due = due_dates(
            status=status, reg_deadline=reg_d, start_date=start_d, submission_deadline=sub_d
        )

        channels = (
            json.loads(reminder_channels_json)
            if isinstance(reminder_channels_json, str)
            else list(reminder_channels_json)
        )

        recipient = {
            "user_id": user_id,
            "discord_webhook_enc": discord_webhook_enc,
            "email_enc": email_enc,
            "callmebot_phone_enc": phone_enc,
            "callmebot_key_enc": key_enc,
        }

        for date_field, date_value in due:
            for offset in reminder_offsets:
                if not should_send(date_value, today, offset):
                    skipped += 1
                    continue
                for channel in channels:
                    already = conn.execute(
                        """
                        SELECT 1 FROM reminders_sent
                        WHERE user_id=%s AND event_id=%s AND date_field=%s
                          AND date_value=%s AND offset_days=%s AND channel=%s
                    """,
                        (user_id, event_id, date_field, date_value, offset, channel),
                    ).fetchone()
                    if already:
                        skipped += 1
                        continue
                    if dry_run:
                        log.info(
                            "dry_run: would send %s reminder to user %s for event %s",
                            channel,
                            user_id,
                            event_id,
                        )
                        sent += 1
                        continue
                    try:
                        _send_via_channel(
                            channel,
                            title,
                            url or "",
                            date_field,
                            date_value,
                            offset,
                            recipient,
                            enc_key,  # type: ignore[arg-type]
                        )
                        conn.execute(
                            """
                            INSERT INTO reminders_sent
                              (user_id, event_id, date_field, date_value, offset_days, channel)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT DO NOTHING
                        """,
                            (user_id, event_id, date_field, date_value, offset, channel),
                        )
                        conn.commit()
                        sent += 1
                    except Exception as exc:
                        log.warning(
                            "reminder failed user=%s event=%s channel=%s: %s",
                            user_id,
                            event_id,
                            channel,
                            exc,
                        )
                        errors.append(str(exc))

    return {"sent": sent, "skipped": skipped, "errors": errors}
