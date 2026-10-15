"""Per-user digest rules (task 2.3). Kinds come from the AI kind field (D-036)."""

from __future__ import annotations

# Priority -> event kinds it covers. Kinds are hackathon | contest | other (D-036), so workshop and
# fest both map to "other" until the kind taxonomy is split.
_KINDS_FOR_PRIORITY = {
    "hackathon": ("hackathon",),
    "contest": ("contest",),
    "workshop": ("other",),
    "fest": ("other",),
}
_ON = ("top", "normal")


def enabled_kinds(priorities: dict[str, str]) -> set[str]:
    """Kinds this person wants messaged. 'top' and 'normal' are on; anything else is off."""
    kinds: set[str] = set()
    for name, level in priorities.items():
        if level in _ON:
            kinds.update(_KINDS_FOR_PRIORITY.get(name, ()))
    return kinds
