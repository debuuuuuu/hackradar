"""Per-user digest rules (task 2.3): which kinds a person's priorities allow."""

from pipeline.user_digest import enabled_kinds


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
