from urllib.parse import urlencode


def gcal_link(
    title: str,
    start_date: str | None,
    end_date: str | None,
    url: str,
    city: str | None = None,
) -> str:
    """Return a Google Calendar template URL for an event.

    start_date / end_date are YYYY-MM-DD strings (IST) or None.
    """
    params: dict[str, str] = {"action": "TEMPLATE", "text": title}
    if start_date:
        s = start_date.replace("-", "")
        e = (end_date or start_date).replace("-", "")
        params["dates"] = f"{s}/{e}"
    if url:
        params["details"] = url
    if city:
        params["location"] = city
    return "https://calendar.google.com/calendar/render?" + urlencode(params)
