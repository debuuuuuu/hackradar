"""Place filter (D-034): normalise source city strings and measure distance from a home city.

Uses the hand-kept table in config/places.yaml, no geocoding service. An unknown city is never
guessed: it counts as "not near" and is reported so the table can grow.
"""

from __future__ import annotations

import re
from functools import cache
from math import asin, cos, radians, sin, sqrt

from pipeline import config

_NON_WORD = re.compile(r"[^a-z0-9]+")


def _key(text: str) -> str:
    return _NON_WORD.sub(" ", text.lower()).strip()


@cache
def _table() -> tuple[dict[str, tuple[float, float]], dict[str, str]]:
    """(coords by metro key, alias or key -> metro key)"""
    coords: dict[str, tuple[float, float]] = {}
    names: dict[str, str] = {}
    for name, info in config.load("places").items():
        coords[name] = (info["lat"], info["lon"])
        for alias in [name, *info.get("aliases", [])]:
            names[_key(alias)] = name
    return coords, names


def resolve(city: str | None) -> tuple[float, float] | None:
    """Coordinates for a source city string, or None if unknown.

    Tries the whole string, then comma-separated parts from the end
    ("Tripura Vasini Palace Grounds, Bengaluru" -> bengaluru).
    """
    if not city:
        return None
    coords, names = _table()
    parts = [city, *reversed(city.split(","))]
    for part in parts:
        metro = names.get(_key(part))
        if metro:
            return coords[metro]
    return None


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle (haversine) distance."""
    (lat1, lon1), (lat2, lon2) = a, b
    h = sin(radians(lat2 - lat1) / 2) ** 2
    h += cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def near_cities(cities: list[str], home: str, radius_km: float) -> tuple[list[str], list[str]]:
    """Split source city strings into (within radius of `home`, unknown to the table)."""
    origin = resolve(home)
    if origin is None:
        raise ValueError(f"home city {home!r} is not in config/places.yaml")
    near, unknown = [], []
    for city in cities:
        spot = resolve(city)
        if spot is None:
            unknown.append(city)
        elif distance_km(origin, spot) <= radius_km:
            near.append(city)
    return near, unknown


def sync_places(conn) -> int:
    """Upsert every config/places.yaml entry into the places table (the website reads it)."""
    rows = [(key, key.title(), lat, lon) for key, (lat, lon) in _table()[0].items()]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO places (key, name, lat, lon) VALUES (%s, %s, %s, %s)"
            " ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name,"
            " lat = EXCLUDED.lat, lon = EXCLUDED.lon",
            rows,
        )
    return len(rows)


def geocode_events(conn) -> int:
    """Set lat/lon on open in-person events whose city resolves. Returns rows updated."""
    found = conn.execute(
        "SELECT id, city FROM events"
        " WHERE status = 'open' AND mode IN ('offline', 'hybrid') AND city IS NOT NULL"
    ).fetchall()
    rows = [(*spot, event_id) for event_id, city in found if (spot := resolve(city))]
    if rows:
        with conn.cursor() as cur:
            cur.executemany("UPDATE events SET lat = %s, lon = %s WHERE id = %s", rows)
    return len(rows)
