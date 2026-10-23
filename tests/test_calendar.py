from pipeline.notify.calendar import gcal_link


def test_gcal_link_includes_title_and_date():
    url = gcal_link("Hack Day", "2026-11-01", "2026-11-02", "https://devpost.com/x")
    assert "calendar.google.com" in url
    assert "Hack+Day" in url or "Hack%20Day" in url
    assert "20261101" in url


def test_gcal_link_no_dates_uses_empty():
    url = gcal_link("Hack Day", None, None, "https://devpost.com/x")
    assert "calendar.google.com" in url
