import pytest

from pipeline import place


def test_aliases_and_comma_fallback_resolve_to_the_metro():
    delhi = place.resolve("Delhi")
    assert place.resolve("West Delhi") == place.resolve("greater noida") == delhi
    assert place.resolve("Bangalore Urban") == place.resolve(
        "Tripura Vasini Palace Grounds, Bengaluru"
    )
    assert place.resolve("jaipur") is not None


def test_unknown_or_missing_city_is_none_not_a_guess():
    # "Kalyanpur" (17 events) is a UP locality, not Kalyan near Mumbai: must not alias.
    assert place.resolve("Kalyanpur") is None
    assert place.resolve("Stanford University") is None
    assert place.resolve(None) is None


def test_distance_pune_mumbai_is_about_120_km():
    assert 110 < place.distance_km(place.resolve("Pune"), place.resolve("Mumbai")) < 135


def test_near_cities_within_150km_of_pune():
    cities = ["Pune", "Karjat", "Powai", "Thane", "Nashik", "Delhi", "Kolhapur", "Kalyanpur", "x"]
    near, unknown = place.near_cities(cities, "pune", 150)
    assert near == ["Pune", "Karjat", "Powai", "Thane"]  # Nashik ~190 km, Kolhapur ~230 km
    assert unknown == ["Kalyanpur", "x"]


def test_unknown_home_city_is_an_error():
    with pytest.raises(ValueError):
        place.near_cities(["Pune"], "atlantis", 100)
