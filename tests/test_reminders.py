from datetime import date

from pipeline.reminders import due_dates, should_send


def test_due_dates_saved_event_reg_deadline():
    """Saved event: remind before reg_deadline only."""
    result = due_dates(
        status="saved",
        reg_deadline=date(2026, 11, 8),
        start_date=date(2026, 11, 15),
        submission_deadline=None,
    )
    assert ("reg_deadline", date(2026, 11, 8)) in result


def test_due_dates_registered_event():
    """Registered event: remind before start_date and submission_deadline."""
    result = due_dates(
        status="registered",
        reg_deadline=date(2026, 11, 8),
        start_date=date(2026, 11, 15),
        submission_deadline=date(2026, 11, 16),
    )
    assert ("start_date", date(2026, 11, 15)) in result
    assert ("submission_deadline", date(2026, 11, 16)) in result
    assert ("reg_deadline", date(2026, 11, 8)) not in result


def test_should_send_offset_hit():
    assert should_send(target=date(2026, 11, 8), today=date(2026, 11, 1), offset_days=7) is True


def test_should_send_offset_miss():
    assert should_send(target=date(2026, 11, 8), today=date(2026, 11, 2), offset_days=7) is False


def test_should_send_same_day():
    assert should_send(target=date(2026, 11, 8), today=date(2026, 11, 8), offset_days=0) is True


def test_due_dates_dismissed_returns_empty():
    result = due_dates(
        status="dismissed",
        reg_deadline=date(2026, 11, 8),
        start_date=None,
        submission_deadline=None,
    )
    assert result == []
