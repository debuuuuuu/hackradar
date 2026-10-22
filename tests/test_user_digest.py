"""Per-user digest (task 2.3): who gets a digest, what is in it, and send-once delivery."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import httpx
from psycopg.types.json import Jsonb

from pipeline.digest import Digest
from pipeline.user_digest import Recipient, enabled_kinds, items_for, recipients, run_user_digests

NOW = datetime(2026, 10, 16, 3, 0, tzinfo=UTC)  # 08:30 IST on 2026-10-16
DEFAULT_PRIORITIES = {"hackathon": "top", "contest": "normal", "workshop": "off", "fest": "off"}


def test_default_priorities_allow_hackathons_and_contests_not_workshops() -> None:
    priorities = {"hackathon": "top", "contest": "normal", "workshop": "off", "fest": "off"}
    assert enabled_kinds(priorities) == {"hackathon", "contest"}


def test_all_off_allows_nothing() -> None:
    priorities = {"hackathon": "off", "contest": "off", "workshop": "off", "fest": "off"}
    assert enabled_kinds(priorities) == set()


def test_workshop_or_fest_on_allows_other_kind() -> None:
    priorities = {"hackathon": "off", "contest": "off", "workshop": "normal", "fest": "off"}
    assert enabled_kinds(priorities) == {"other"}


def test_unknown_priority_value_is_treated_as_off() -> None:
    priorities = {"hackathon": "maybe"}
    assert enabled_kinds(priorities) == set()


# --- database tests -------------------------------------------------------------------------


def _user(
    conn,
    *,
    enabled: bool = True,
    onboarded: bool = True,
    channels: list[str] | None = None,
    priorities: dict[str, str] | None = None,
    fmt: str = "anything",
    home: str = "pune",
    radius: int = 150,
) -> int:
    uid = conn.execute(
        "INSERT INTO users (name, digest_enabled, onboarded_at, discord_webhook_enc)"
        " VALUES ('t', %s, %s, 'enc-webhook') RETURNING id",
        (enabled, NOW if onboarded else None),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO preferences (user_id, home_city, radius_km, format, priorities, channels)"
        " VALUES (%s, %s, %s, %s, %s, %s)",
        (
            uid,
            home,
            radius,
            fmt,
            Jsonb(priorities or DEFAULT_PRIORITIES),
            Jsonb({"digest": channels or ["discord"]}),
        ),
    )
    return uid


def _event(
    conn,
    title: str,
    *,
    kind: str = "hackathon",
    mode: str | None = "online",
    city: str | None = None,
    days_to_deadline: int = 10,
) -> int:
    eid = conn.execute(
        "INSERT INTO events (title, kind, mode, city, reg_deadline, first_seen_at)"
        " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (title, kind, mode, city, NOW + timedelta(days=days_to_deadline), NOW - timedelta(days=1)),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO event_sources (event_id, source, source_id, url, content_hash)"
        " VALUES (%s, 'devpost', %s, %s, 'h')",
        (eid, title, f"https://example.com/{title}"),
    )
    return eid


class Recorder:
    """Stands in for a channel sender: records successful calls, raises for chosen users."""

    def __init__(self, fail_for: frozenset[int] = frozenset()) -> None:
        self.fail_for = fail_for
        self.sent: list[int] = []

    def __call__(self, recipient: Recipient, digest: Digest) -> None:
        if recipient.user_id in self.fail_for:
            raise RuntimeError("provider down")
        self.sent.append(recipient.user_id)


def _recipient(conn, uid: int) -> Recipient:
    return next(r for r in recipients(conn, NOW) if r.user_id == uid)


def test_new_signup_gets_digest_without_approval(conn) -> None:
    uid = _user(conn)  # approved_at stays NULL: sign-up is automatic (D-044)
    _event(conn, "open-event")
    assert uid in [r.user_id for r in recipients(conn, NOW)]
    rec = Recorder()
    summary = run_user_digests(conn, NOW, {"discord": rec})
    assert summary.sent == 1


def test_digest_disabled_user_gets_nothing(conn) -> None:
    uid = _user(conn, enabled=False)
    _event(conn, "open-event")
    assert uid not in [r.user_id for r in recipients(conn, NOW)]
    rec = Recorder()
    run_user_digests(conn, NOW, {"discord": rec})
    assert rec.sent == []


def test_priority_off_kind_is_excluded(conn) -> None:
    priorities = {"hackathon": "off", "contest": "normal", "workshop": "off", "fest": "off"}
    uid = _user(conn, priorities=priorities)
    _event(conn, "hack-event")
    _event(conn, "contest-event", kind="contest")
    digest = items_for(conn, _recipient(conn, uid), None, NOW)
    assert digest.new == []
    assert [i.title for i in digest.contests] == ["contest-event"]


def test_far_in_person_event_is_excluded(conn) -> None:
    uid = _user(conn, fmt="online_near")
    _event(conn, "online-event")
    _event(conn, "near-event", mode="offline", city="Pune")
    _event(conn, "far-event", mode="offline", city="Delhi")
    digest = items_for(conn, _recipient(conn, uid), None, NOW)
    assert sorted(i.title for i in digest.new) == ["near-event", "online-event"]


def test_sender_failure_for_one_user_does_not_stop_another(conn) -> None:
    first = _user(conn)
    second = _user(conn)
    _event(conn, "open-event")
    rec = Recorder(fail_for=frozenset({first}))
    summary = run_user_digests(conn, NOW, {"discord": rec})
    assert rec.sent == [second]
    assert (summary.sent, summary.failed) == (1, 1)


def test_running_twice_same_day_sends_once(conn) -> None:
    _user(conn)
    # Closing within the window, so the digest is non-empty even when `since` is a real DB time.
    _event(conn, "open-event", days_to_deadline=1)
    rec = Recorder()
    first = run_user_digests(conn, NOW, {"discord": rec})
    second = run_user_digests(conn, NOW, {"discord": rec})
    assert (first.sent, second.sent) == (1, 0)
    assert second.already_sent == 1
    assert len(rec.sent) == 1


def test_email_is_not_sent_until_confirmation_exists(conn) -> None:
    uid = _user(conn, channels=["email", "discord"])
    _event(conn, "open-event")
    email, discord = Recorder(), Recorder()
    run_user_digests(conn, NOW, {"email": email, "discord": discord})
    assert email.sent == []
    assert discord.sent == [uid]


def test_email_is_sent_only_to_a_verified_sign_in_address(conn) -> None:
    verified = _user(conn, channels=["email"])
    typed_in = _user(conn, channels=["email"])  # an address entered by hand has no email_hash
    conn.execute(
        "UPDATE users SET email_enc = 'enc-email', email_hash = 'hash' WHERE id = %s", (verified,)
    )
    conn.execute("UPDATE users SET email_enc = 'enc-email' WHERE id = %s", (typed_in,))
    _event(conn, "open-event")
    email = Recorder()
    run_user_digests(conn, NOW, {"email": email})
    assert email.sent == [verified]


def test_failing_sender_logs_no_webhook_token(conn, caplog) -> None:
    _user(conn)
    _event(conn, "open-event")
    token = "SuperSecretToken_123"
    url = f"https://discord.com/api/webhooks/111222333/{token}"

    def failing(recipient: Recipient, digest: Digest) -> None:
        httpx.Response(404, request=httpx.Request("POST", url)).raise_for_status()

    with caplog.at_level(logging.INFO):
        summary = run_user_digests(conn, NOW, {"discord": failing})
    assert summary.failed == 1
    assert "failed" in caplog.text
    assert token not in caplog.text


# --- picks (For you) ----------------------------------------------------------------------


def _score(conn, uid: int, eid: int, score: int, reason: str = "fits your AI interest") -> None:
    conn.execute(
        "INSERT INTO scores (user_id, event_id, score, reason, model) VALUES (%s, %s, %s, %s, 'm')",
        (uid, eid, score, reason),
    )


def test_user_without_scores_has_no_picks_and_the_usual_lists(conn) -> None:
    uid = _user(conn)
    _event(conn, "plain-new")
    d = items_for(conn, _recipient(conn, uid), None, NOW)
    assert d.picks == []
    assert [i.title for i in d.new] == ["plain-new"]
    assert d.new[0].event_id is not None and d.new[0].why is None and d.new[0].clash is None


def test_picks_are_the_top_scored_new_and_closing_events_with_a_why(conn) -> None:
    uid = _user(conn)
    low = _event(conn, "low", days_to_deadline=10)
    high = _event(conn, "high", days_to_deadline=11)
    closing = _event(conn, "closing", days_to_deadline=1)
    _event(conn, "unscored", days_to_deadline=12)
    _score(conn, uid, low, 20)
    _score(conn, uid, high, 90, "great fit")
    _score(conn, uid, closing, 60, "")
    d = items_for(conn, _recipient(conn, uid), None, NOW)
    assert [p.title for p in d.picks] == ["high", "closing", "low"]
    assert d.picks[0].why == "great fit"
    assert d.picks[1].why is None  # an empty stored reason never becomes an empty line
    assert {i.title for i in d.new} == {"low", "high", "unscored"}  # lists stay complete
    assert [i.title for i in d.closing] == ["closing"]
    assert d.new_total == 3 and d.closing_total == 1
    assert not d.empty


def test_picks_are_capped_at_top_n(conn) -> None:
    uid = _user(conn)
    for n in range(7):
        _score(conn, uid, _event(conn, f"e{n}", days_to_deadline=10 + n), 50 + n)
    d = items_for(conn, _recipient(conn, uid), None, NOW)
    assert [p.title for p in d.picks] == ["e6", "e5", "e4", "e3", "e2"]
    assert len(d.new) == 7  # picks are not removed from the lists


def test_a_clashing_high_score_sorts_after_a_non_clashing_one(conn) -> None:
    uid = _user(conn)
    clash = _event(conn, "clash", mode="offline", city="pune")
    fine = _event(conn, "fine", days_to_deadline=11)
    conn.execute(
        "UPDATE events SET start_date = %s, end_date = %s WHERE id = %s",
        (NOW + timedelta(days=12), NOW + timedelta(days=13), clash),
    )
    conn.execute(
        "INSERT INTO busy_periods (user_id, starts_on, ends_on, label)"
        " VALUES (%s, %s, %s, 'exams')",
        (uid, (NOW + timedelta(days=11)).date(), (NOW + timedelta(days=14)).date()),
    )
    _score(conn, uid, clash, 95)
    _score(conn, uid, fine, 40)
    d = items_for(conn, _recipient(conn, uid), None, NOW)
    assert [p.title for p in d.picks] == ["fine", "clash"]
    assert d.picks[0].clash is None and d.picks[1].clash == "exams"


def test_picks_alone_do_not_make_an_empty_digest_non_empty() -> None:
    d = Digest(day="2026-10-16", new=[], new_total=0, closing=[], closing_total=0, open_total=0)
    assert d.picks == [] and d.empty
