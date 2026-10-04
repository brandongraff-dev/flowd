"""Transparent regex vocabularies: disclosure, calls to action, beats. Day-one rules; replaced by a classifier trained on
approve/reject once settled posts exist (BLUEPRINT ML system 3)."""

from __future__ import annotations

import re
from typing import Final

from .normalize import norm

_I = re.IGNORECASE

# Spoken disclosure: "#ad", "this is an ad", "paid partnership", "sponsored by ...". "no ads" / "ad-free" do not count.
DISCLOSURE_SPOKEN: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"(?<![\w-])(?:hashtag |#)ad(?![\w-])", _I),
    re.compile(r"(?<![\w-])(?:an?|this is (?:an?|my)|is an?|paid|sponsored) ad(?:vert(?:isement)?)?(?![\w-])", _I),
    re.compile(r"\bpaid partnership\b", _I),
    re.compile(r"\bpaid promotion\b", _I),
    re.compile(r"\bsponsored\b", _I),
    re.compile(r"\b(?:in )?partnership with\b", _I),
    re.compile(r"\bpartnered with\b", _I),
    re.compile(r"\badvertisement\b", _I),
)

# On-screen disclosure label.
DISCLOSURE_ONSCREEN: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"(?<![\w-])#ad(?![\w-])", _I),
    re.compile(r"(?<![\w#-])ad(?![\w-])", _I),
    re.compile(r"#(?:sponsored|paidpartnership|advert|partner)\b", _I),
    re.compile(r"\bpaid partnership\b", _I),
    re.compile(r"\bsponsored\b", _I),
)

AI_LABEL: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"\bai[- ]generated\b", _I),
    re.compile(r"\bmade with ai\b", _I),
    re.compile(r"\bai[- ]created\b", _I),
    re.compile(r"\b(?:#aigenerated|#madewithai|#ai)\b", _I),
    re.compile(r"\bcreated (?:by|with) ai\b", _I),
)

CTA_PATTERNS: Final[dict[str, re.Pattern[str]]] = {
    "link_in_bio": re.compile(
        r"\b(?:link (?:is )?in (?:my |the )?(?:bio|profile)|tap the link|link below|click the link|bio link)\b", _I
    ),
    "use_code": re.compile(r"\b(?:use (?:my )?(?:promo )?code|promo code|with code|code [a-z0-9]{3,12}\b)", _I),
    "try_free": re.compile(
        r"\b(?:try (?:it )?(?:for )?free|start (?:your|a|the) free|free trial|free for (?:\d+|a|the first) (?:days?|week|month)|\d+[- ]day free)\b",
        _I,
    ),
    "download_now": re.compile(
        r"\b(?:download (?:it|the app|now|today|here)|get the app|install (?:it|the app))\b", _I
    ),
    "search_app_store": re.compile(
        r"\bsearch (?:for )?[\w' ]{0,30}(?:in|on) the (?:app store|play store)|\bsearch the (?:app store|play store)\b|\bfind (?:it|me) on the (?:app store|play store)\b",
        _I,
    ),
    "comment_for_link": re.compile(
        r"\bcomment (?:[\"']?\w+[\"']? )?(?:and i'?ll|for|to get) (?:send |dm )?(?:you )?(?:the )?link\b|\bcomment (?:below )?for (?:the )?link\b",
        _I,
    ),
}

BEAT_PATTERNS: Final[dict[str, re.Pattern[str]]] = {
    "problem": re.compile(
        r"\b(?:struggl\w*|tired of|sick of|hate[sd]?|annoying|frustrat\w+|can'?t (?:stop|focus|sleep|keep|find)|the problem|always (?:forget|lose|run out)|never (?:have|find|know)|used to (?:hate|struggle|spend)|stress\w*|messy|chaos)\b",
        _I,
    ),
    "app_reveal": re.compile(
        r"\b(?:this app|the app|an app|my app|downloaded|found an app|introducing|meet|i found)\b", _I
    ),
    "demo": re.compile(
        r"\b(?:watch|let me show|look at|i tap|tap(?:ping)?|swipe|open(?:ing)? (?:it|the app)|here'?s how|see how|scan|generate[sd]?|record(?:ing)?|just (?:type|upload|pick))\b",
        _I,
    ),
    "payoff": re.compile(
        r"\b(?:result|now i|finally|so much (?:easier|better|faster)|saved me|saves me|changed|it works|worth it|i love|obsessed|game[- ]changer|couldn'?t believe)\b",
        _I,
    ),
    "proof": re.compile(
        r"\b(?:\d+(?:\.\d+)?\s*(?:%|percent|x|days?|weeks?|lbs?|pounds?|minutes?|hours?|k)|\$\s?\d+|before and after|before|after|screenshot|stat|study|proof|results?)\b",
        _I,
    ),
    "offer": re.compile(
        r"\b(?:free trial|try (?:it )?(?:for )?free|free for|\d+[- ]day|first (?:week|month)|discount|\d+% off|promo|special offer|didn'?t pay|no credit card)\b",
        _I,
    ),
    "win_state": re.compile(
        r"\b(?:done|boom|look at (?:that|this)|there it is|just like that|nailed it|so good|perfect|finished|all set|ready|and that'?s it)\b",
        _I,
    ),
    "reaction": re.compile(r"\b(?:wow|omg|oh my|no way|whoa|insane|crazy|unreal|are you kidding|wait what)\b", _I),
    "key_feature": re.compile(
        r"\b(?:feature|mode|tool|filter|widget|reminder|template|scanner|tracker|planner|timer|library)\b", _I
    ),
}

# A line made only of these words is a greeting or throat-clearing, not the hook.
GREETING_WORDS: Final = frozenset(
    [
        "hey",
        "hi",
        "hello",
        "yo",
        "guys",
        "everyone",
        "y'all",
        "friends",
        "welcome",
        "back",
        "to",
        "my",
        "channel",
        "video",
        "again",
        "and",
        "in",
        "this",
        "so",
        "okay",
        "ok",
        "um",
        "uh",
        "alright",
        "what's",
        "up",
        "good",
        "morning",
        "afternoon",
        "evening",
        "it's",
        "me",
    ]
)

WIN_WORDS: Final = re.compile(
    r"\b(?:done|finally|worked|works|perfect|love|result|better|easier|saved|nailed|there it is|so good|amazing|obsessed|ready)\b",
    _I,
)


def spoken_disclosure_span(text: str) -> re.Match[str] | None:
    n = norm(text)
    for p in DISCLOSURE_SPOKEN:
        m = p.search(n)
        if m:
            return m
    return None


def has_onscreen_disclosure(text: str) -> bool:
    n = norm(text)
    return any(p.search(n) for p in DISCLOSURE_ONSCREEN)


def has_ai_label(text: str) -> bool:
    n = norm(text)
    return any(p.search(n) for p in AI_LABEL)


def cta_types_in(text: str) -> list[str]:
    """Distinct call-to-action types found, in the order of ``CTA_PATTERNS``."""
    n = norm(text)
    return [name for name, p in CTA_PATTERNS.items() if p.search(n)]


def is_filler(text: str) -> bool:
    """True for a greeting or throat-clearing line ("hey guys, welcome back to my channel"): it cannot be the hook."""
    toks = re.findall(r"[a-z0-9']+", norm(text))
    return not toks or all(t in GREETING_WORDS for t in toks)
