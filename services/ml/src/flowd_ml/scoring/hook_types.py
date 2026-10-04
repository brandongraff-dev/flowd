"""Hook types: day-one prior, the above-median rule, and a transparent keyword classifier for transcript openers."""

from __future__ import annotations

import re
from collections.abc import Mapping

from ..constants import HOOK_TYPE_PRIOR_INDEX
from ..numeric import median


def above_median_types(stats: Mapping[str, float] | None = None) -> frozenset[str]:
    """Hook types whose trial rate is strictly above the median hook type.

    ``stats`` are observed trial rates by hook type (State of App UGC); with fewer than three observed types the
    day-one prior index is used instead, because a median of one or two numbers means nothing.
    """
    table: Mapping[str, float] = stats if stats is not None and len(stats) >= 3 else HOOK_TYPE_PRIOR_INDEX
    cut = median(table.values())
    return frozenset(t for t, v in table.items() if v > cut)


def resolve_hook_type(
    hook_type: str | None,
    known: bool | None,
    above_median: bool | None,
    stats: Mapping[str, float] | None = None,
) -> tuple[bool, bool, str]:
    """Return ``(known, above_median, source)`` for the ``proven_hook_type`` item.

    Explicit booleans always win (the contract's ``obs`` fields). Otherwise ``hook_type`` is looked up against the
    stats table or the day-one prior.
    """
    if known is None:
        known = hook_type is not None
    if above_median is None:
        above_median = bool(known and hook_type is not None and hook_type in above_median_types(stats))
        source = "observed trial rates" if stats is not None and len(stats) >= 3 else "day-one prior"
    else:
        source = "supplied"
    return bool(known), bool(above_median and known), source


# ── keyword classifier used by the video pipeline on the first spoken line ──────────────────────
_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("pov", re.compile(r"^\s*(pov|point of view)\b", re.I)),
    (
        "confession",
        re.compile(
            r"\b(i was wrong|i (?:didn'?t|did not) expect|i never thought|confession|i('?m| am) not going to lie|i regret|i('ll| will) admit|honestly,? i|i used to hate)\b",
            re.I,
        ),
    ),
    (
        "risk_reversal",
        re.compile(
            r"\b(didn'?t pay|without paying|free (for|trial)|try it free|no (cost|credit card)|cancel anytime|first week (free|was free)|\d+[- ]day free)\b",
            re.I,
        ),
    ),
    (
        "specific_number",
        re.compile(
            r"\b\d[\d,.]*\s*(minutes?|mins?|hours?|days?|weeks?|months?|dollars?|bucks|k|x|percent|%|steps?|reps?|pounds?|lbs)\b|\$\s?\d",
            re.I,
        ),
    ),
    (
        "curiosity_gap",
        re.compile(
            r"\b(wait (until|till|for)|you won'?t believe|here'?s (what|why|how)|what (this|it) (did|does)|the one (thing|app)|nobody (tells|talks)|secret|this changed)\b",
            re.I,
        ),
    ),
    (
        "direct_question",
        re.compile(r"^\s*(why|what|how|who|which|did|do|does|are|is|have|can|should)\b[^.!]*\?|\?\s*$", re.I),
    ),
)


def classify_hook_text(text: str) -> str | None:
    """Best-effort library hook type of an opener. ``None`` means "not a library hook type" (scored as such)."""
    cleaned = text.strip()
    if not cleaned:
        return None
    for hook_type, pattern in _RULES:
        if pattern.search(cleaned):
            return hook_type
    if re.match(
        r"^\s*(and (?:then|that'?s|so)\b|but\b|because\b|which is why\b|anyway\b|okay,? so\b|so,? |wait,? )",
        cleaned,
        re.I,
    ):
        return "pattern_interrupt"
    return None
