"""Text normalisation shared by the QA checks, beat detection and hook typing."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "..."})
_TOKEN = re.compile(r"[#$]?[a-z0-9]+(?:'[a-z]+)?")
_STOP = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "but",
        "by",
        "for",
        "from",
        "has",
        "have",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "me",
        "my",
        "of",
        "on",
        "or",
        "our",
        "so",
        "than",
        "that",
        "the",
        "their",
        "then",
        "there",
        "these",
        "they",
        "this",
        "to",
        "up",
        "was",
        "we",
        "were",
        "what",
        "when",
        "which",
        "who",
        "will",
        "with",
        "you",
        "your",
    ]
)


def norm(text: str) -> str:
    """NFKC, lower-case, straight quotes, single spaces."""
    s = unicodedata.normalize("NFKC", text).translate(_QUOTES).lower()
    return re.sub(r"\s+", " ", s).strip()


def tokens(text: str, *, drop_stop: bool = False) -> list[str]:
    toks = _TOKEN.findall(norm(text))
    return [t for t in toks if t not in _STOP] if drop_stop else toks


def phrase_pattern(phrase: str) -> re.Pattern[str]:
    """Whole-word, punctuation-tolerant, case-insensitive pattern for a phrase ("lose 10 lbs" matches "lose 10 lbs.")."""
    words = [re.escape(w) for w in re.findall(r"[\w#$%']+", norm(phrase))]
    if not words:
        return re.compile(r"(?!x)x")
    return re.compile(r"(?<![\w#])" + r"[\W_]+".join(words) + r"(?![\w])", re.I)


def contains_phrase(text: str, phrase: str) -> bool:
    return phrase_pattern(phrase).search(norm(text)) is not None


def overlap(a: str, b: str) -> float:
    """Share of the tokens of ``a`` found in ``b`` (stop words dropped). 0 when ``a`` has no content words."""
    ta = set(tokens(a, drop_stop=True))
    if not ta:
        return 0.0
    return len(ta & set(tokens(b, drop_stop=True))) / len(ta)


def first_match(text: str, patterns: Iterable[re.Pattern[str]]) -> re.Match[str] | None:
    n = norm(text)
    for p in patterns:
        m = p.search(n)
        if m:
            return m
    return None
