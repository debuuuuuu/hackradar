from datetime import datetime, timedelta

from pipeline.dedupe import Candidate, find_groups, is_duplicate
from pipeline.normalize import IST

T0 = datetime(2026, 10, 1, tzinfo=IST)


def cand(id, title, org, source, dates=(), seen=0):
    return Candidate(id, title, org, frozenset({source}), T0 + timedelta(hours=seen), tuple(dates))


def test_same_event_on_two_platforms_matches_on_organiser_word():
    # Real case: Devpost vs Unstop, different organiser strings and different deadlines.
    a = cand(6, "Multimodal AI Hackathon 2026", "Kamand Prompt, IIT Mandi", "devpost")
    b = cand(
        305, "Multimodal AI Hackathon 2026", "Indian Institute of Technology (IIT), Mandi", "unstop"
    )
    assert is_duplicate(a, b)


def test_shorter_title_contained_in_longer_needs_second_signal():
    a = cand(1, "CodeSprint by Elite Coders", "Elite Coders", "devpost")
    b = cand(2, "Codesprint 2026", "Elite Coders", "unstop")
    assert is_duplicate(a, b)
    assert not is_duplicate(a, cand(3, "Codesprint 2026", "RANKUP", "unstop"))


def test_dates_are_a_second_signal():
    d = datetime(2026, 11, 14, tzinfo=IST)
    a = cand(1, "Smart City Challenge", None, "devpost", [d])
    assert is_duplicate(
        a, cand(2, "Smart City Challenge", "Other", "unstop", [d + timedelta(days=2)])
    )
    assert not is_duplicate(
        a, cand(3, "Smart City Challenge", "Other", "unstop", [d + timedelta(days=9)])
    )


def test_same_source_never_merges():
    a = cand(1, "Robo Race", "Techkriti", "unstop")
    assert not is_duplicate(a, cand(2, "Robo Race", "Techkriti", "unstop"))


def test_generic_titles_never_merge():
    # "Hackathon" has no distinctive words, even with the same organiser.
    a = cand(1, "Hackathon", "IIT Mandi", "devpost")
    assert not is_duplicate(a, cand(2, "Hackathon 2026", "IIT Mandi", "unstop"))


def test_similar_but_different_events_stay_apart():
    a = cand(1, "CodeVerse India - National Level Hackathon", "WeCodeCoders", "devpost")
    b = cand(2, "CodeHack India - National Level Hackathon", "WeCodeCoders", "unstop")
    assert not is_duplicate(a, b)


def test_find_groups_keeps_oldest_first():
    a = cand(9, "Multimodal AI", "IIT Mandi", "unstop", seen=5)
    b = cand(3, "Multimodal AI", "IIT Mandi", "devpost", seen=1)
    lone = cand(4, "Something else", "X", "devpost")
    (group,) = find_groups([a, b, lone])
    assert [c.id for c in group] == [3, 9]


def test_dates_alone_do_not_merge_a_short_title_into_a_long_one():
    d = datetime(2026, 11, 14, tzinfo=IST)
    a = cand(1, "AI Build India", "Hacker's Unity", "devpost", [d])
    b = cand(
        2, "CodewithChat AI Dev Challenge: Build, Launch & Monetize", "CodewithChat", "unstop", [d]
    )
    assert not is_duplicate(a, b)
