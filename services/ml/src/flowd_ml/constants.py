"""Constants.

Two groups, kept apart on purpose:

1. CONTRACT MIRROR. Numbers that already live in ``packages/contract/schema/constants.mjs`` (DOMAIN.md section 9,
   DECISIONS.md). They are copied here verbatim and a parity test (``tests/test_contract_parity.py``) re-reads the
   JavaScript source with node and fails on any drift. Never edit these without editing the contract first.
2. SERVICE HEURISTICS. Day-one priors that only this service owns (hook-type priors, category CPM defaults, QA
   thresholds, fraud detector shapes ...). Each is a hypothesis to be replaced by settled-post data; they are named
   ``*_PRIOR`` / ``*_DEFAULT`` so nobody mistakes them for contract facts.
"""

from __future__ import annotations

from typing import Final, Literal, TypedDict

NOW: Final = "2026-10-03T14:00:00Z"

# ── contract mirror ─────────────────────────────────────────────────────────────────────────────

PLAN_TAKE_RATE: Final[dict[str, float]] = {"free": 0.12, "pro": 0.10, "scale": 0.08}
CPA_ONLY_TAKE_RATE: Final = 0.06
MATCHED_FIRST_BOUNTY_CAP_CENTS: Final = 50_000
CARD_PROCESSING_RATE: Final = 0.029
CARD_PROCESSING_FIXED_CENTS: Final = 30

PAY_DEFAULT_CPM_CENTS: Final = 200
PAY_FLOOR_CPM_CENTS: Final = 50
PAY_DEFAULT_CAP_CENTS: Final = 25_000
PAY_MIN_BOUNTY_BUDGET_CENTS: Final = 10_000
LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS: Final = (
    1_500  # Brief Lint: warn when the median creator earns less than $15 per video
)

BANDS: Final[dict[str, int]] = {"A": 85, "B": 70, "C": 55, "D": 40, "E": 0}
BAND_ORDER: Final[tuple[str, ...]] = ("A", "B", "C", "D", "E")
BAND_VIEW_MULTIPLIER: Final[dict[str, float]] = {"A": 1.6, "B": 1.15, "C": 0.85, "D": 0.5, "E": 0.3}
CHECKLIST_LABEL: Final = "Checklist score. It gets smarter as bounties settle."
LEARNED_READY_AT_POSTS: Final = 1000


class ChecklistItem(TypedDict):
    id: str
    label: str
    weight: int
    rule: str


HOOK_CHECKLIST: Final[tuple[ChecklistItem, ...]] = (
    {
        "id": "hook_lands_2s",
        "label": "Hook lands by 2.0s",
        "weight": 20,
        "rule": "Full if the hook line lands by 2.0 s; half by 3.0 s; otherwise 0.",
    },
    {
        "id": "onscreen_text_matches",
        "label": "On-screen text mirrors the spoken hook within 1s",
        "weight": 15,
        "rule": "Full if the spoken hook is also on screen as text within 1.0 s; half if it appears by 2.0 s or only partly matches.",
    },
    {
        "id": "face_early",
        "label": "A face is on screen within the first second",
        "weight": 15,
        "rule": "Full if a face is on screen within 1.0 s; half by 2.0 s. Faceless formats get full points.",
    },
    {
        "id": "app_visible_3s",
        "label": "App or product visible by 3s",
        "weight": 15,
        "rule": "Full if the app is visible by 3.0 s; half by 5.0 s.",
    },
    {
        "id": "pattern_interrupt",
        "label": "Motion or pattern interrupt in the first 1.5s",
        "weight": 10,
        "rule": "Full if there is a cut, motion or visual pattern interrupt in the first 1.5 s.",
    },
    {
        "id": "proven_hook_type",
        "label": "Uses a proven hook type",
        "weight": 10,
        "rule": "Full if the hook is a library hook type with an above-median trial rate; half for any other library hook type; 0 otherwise.",
    },
    {
        "id": "speech_starts_fast",
        "label": "Speech starts within 1s, no dead air",
        "weight": 10,
        "rule": "Full if speech starts within 1.0 s; half within 2.0 s.",
    },
    {
        "id": "captions_safe_zone",
        "label": "Captions burned in, inside safe zones",
        "weight": 5,
        "rule": "Full if captions are burned in and inside the platform safe zones; otherwise 0.",
    },
)

FLOW_CHECKLIST: Final[tuple[ChecklistItem, ...]] = (
    {"id": "hook_score", "label": "Hook Score (scaled)", "weight": 30, "rule": "round(Hook Score points x 0.30)."},
    {
        "id": "required_beats",
        "label": "Required beats covered",
        "weight": 25,
        "rule": "round(25 x required beats found / required beats in the brief).",
    },
    {
        "id": "app_visible_early",
        "label": "App on screen early",
        "weight": 10,
        "rule": "Full if the app is on screen by 3.0 s; half by 8.0 s.",
    },
    {
        "id": "disclosure",
        "label": "Disclosure present (audio and on-screen)",
        "weight": 10,
        "rule": "10 if #ad is both spoken and on screen; 5 if only one; 0 if neither (a missing disclosure also blocks settlement).",
    },
    {
        "id": "length_ok",
        "label": "Length 15 to 30 seconds",
        "weight": 5,
        "rule": "Full for 15 to 30 s; half for 10 to 15 s or 30 to 45 s; otherwise 0.",
    },
    {
        "id": "captions_safe_zone",
        "label": "Captions inside safe zones",
        "weight": 5,
        "rule": "Full if captions are inside the platform safe zones; otherwise 0.",
    },
    {
        "id": "single_cta_win_state",
        "label": "One CTA, ends on a win state",
        "weight": 5,
        "rule": "Full if there is exactly one CTA and the video ends on a win state; half if one of the two.",
    },
    {
        "id": "audio_clear",
        "label": "Audio clear, no dead air",
        "weight": 5,
        "rule": "Full if speech is clear with no dead air over 1.0 s; half if there is one gap.",
    },
    {
        "id": "format_fit",
        "label": "Follows the chosen format's beats",
        "weight": 5,
        "rule": "Full if the video follows the format's beat order; half if one beat is out of order.",
    },
)

FraudSignalId = Literal[
    "view_spike_no_engagement",
    "cap_clustering",
    "bought_views_pattern",
    "geo_mismatch",
    "view_to_follower_outlier",
    "new_account",
    "duplicate_hash",
    "engagement_anomaly",
    "traffic_source_anomaly",
    "curve_shape",
]

FRAUD_SIGNALS: Final[dict[str, tuple[int, str]]] = {
    "view_spike_no_engagement": (
        25,
        "Hourly views at least 10x the post baseline while engagement stays under 0.5% of views.",
    ),
    "cap_clustering": (
        20,
        "Earnings land within 2% of the per-video cap on 3 of the creator's last 5 posts, or views snap to the cap.",
    ),
    "bought_views_pattern": (
        30,
        'Step-function curve: 80% or more of views arrive in two hourly buckets, flat otherwise, and over 60% of views come from the "other" source.',
    ),
    "geo_mismatch": (15, "Audience in the bounty target region is more than 25 points below the bounty minimum."),
    "view_to_follower_outlier": (10, "Views are more than 40x followers on an account under 5,000 followers."),
    "new_account": (10, "Social account younger than 30 days."),
    "duplicate_hash": (
        20,
        "Perceptual hash within distance 6 of another creator's video or the creator's own earlier post.",
    ),
    "engagement_anomaly": (
        10,
        "Likes under 0.4% of views, or comment ratio an outlier against the account's 28-day norm.",
    ),
    "traffic_source_anomaly": (10, 'More than 50% of views from external or "other" sources.'),
    "curve_shape": (10, "No natural decay: hourly views flat or rising for more than 24 hours."),
}
FRAUD_BANDS: Final[dict[str, tuple[int, int]]] = {
    "clean": (0, 19),
    "watch": (20, 39),
    "review": (40, 69),
    "high": (70, 100),
}
FRAUD_REVIEW_THRESHOLD: Final = 40
FRAUD_HOLD_THRESHOLD: Final = 70
FRAUD_REVIEW_SLA_HOURS: Final = 24
DUPLICATE_PHASH_MAX_DISTANCE: Final = 6

FUNNEL_VIEW_TO_VISIT: Final = 0.0045
FUNNEL_VISIT_TO_INSTALL: Final = 0.38
FUNNEL_INSTALL_TO_TRIAL: Final = 0.062
FUNNEL_TRIAL_TO_PAID: Final = 0.348
VIEWS_QUANTILE_RATIO: Final[dict[str, float]] = {"p25": 0.4, "median": 1.0, "p75": 2.55}

MATCH_WEIGHTS: Final[dict[str, int]] = {
    "niche": 40,
    "platform": 15,
    "region": 15,
    "price": 15,
    "brand_reliability": 10,
    "recency": 5,
}
MATCH_RECENCY_HALF_LIFE_DAYS: Final = 14
MATCH_PRICE_RATIO_CAP: Final = 1.5
MATCH_GATES: Final[tuple[str, ...]] = (
    "eligibility_tier",
    "country",
    "platform_account_linked",
    "funded",
    "not_already_submitted",
)
MATCH_MIN_TO_RANK_FIRST: Final = 60

PRICING_FILL_EXPONENT: Final = 1.6
PRICING_P80_MULTIPLIER: Final = 1.8
PRICING_MIN_FILL_HOURS: Final = 6
PRICING_CONFIDENCE_K: Final = 20
PRICING_CURVE_MULTIPLIERS: Final[tuple[float, ...]] = (0.6, 0.8, 1.0, 1.2, 1.5, 2.0)
PRICING_THIN_MARKET_MIN_SAMPLE: Final = 8

TIER_ORDER: Final[tuple[str, ...]] = ("bronze", "silver", "gold", "platinum", "elite")

STUDIO_HOOK_MUST_LAND_S: Final = 2
STUDIO_APP_VISIBLE_BY_S: Final = 3
STUDIO_ASPECT: Final = "9:16"
STUDIO_WIDTH: Final = 1080
STUDIO_HEIGHT: Final = 1920
STUDIO_MIN_DURATION_S: Final = 15
STUDIO_MAX_DURATION_S: Final = 60

COMPLIANCE_DISCLOSURE_TAG: Final = "#ad"
COMPLIANCE_DEFAULT_DISCLOSURE: Final = "#ad Paid partnership with {brand}"

AUTO_APPROVE_DEFAULT_MAX_FRAUD_SCORE: Final = 20

ENUM_HOOK_TYPES: Final[tuple[str, ...]] = (
    "confession",
    "curiosity_gap",
    "specific_number",
    "pov",
    "direct_question",
    "risk_reversal",
    "pattern_interrupt",
)
ENUM_BEAT_IDS: Final[tuple[str, ...]] = (
    "hook",
    "problem",
    "app_reveal",
    "demo",
    "key_feature",
    "payoff",
    "proof",
    "offer",
    "cta",
    "win_state",
    "reaction",
    "end_card",
)
ENUM_FORMAT_IDS: Final[tuple[str, ...]] = (
    "tmpl_screen_reaction",
    "tmpl_hidden_gem",
    "tmpl_confession",
    "tmpl_problem_solution",
    "tmpl_faceless_slideshow",
    "tmpl_green_screen",
    "tmpl_results_update",
    "tmpl_identity_shift",
    "tmpl_free_trial_lead",
    "tmpl_reply_comment",
    "tmpl_carousel_video",
)
ENUM_CTA_TYPES: Final[tuple[str, ...]] = (
    "link_in_bio",
    "use_code",
    "try_free",
    "download_now",
    "search_app_store",
    "comment_for_link",
)
ENUM_CATEGORIES: Final[tuple[str, ...]] = (
    "ai_photo",
    "ai_assistant",
    "fitness",
    "language",
    "productivity",
    "finance",
    "sleep_mind",
    "music_audio",
    "lifestyle",
)
ENUM_NICHES: Final[tuple[str, ...]] = (
    "ai_tools",
    "tech",
    "fitness",
    "wellness",
    "productivity",
    "study",
    "money",
    "lifestyle",
    "beauty",
    "travel",
    "food",
    "parenting",
)
ENUM_COUNTRIES: Final[tuple[str, ...]] = ("US", "CA", "GB", "AU", "IE", "DE", "FR", "ES", "NL", "BR", "MX", "PH")
ENUM_PLATFORMS: Final[tuple[str, ...]] = ("tiktok", "instagram", "youtube")
ENUM_TRAFFIC_SOURCES: Final[tuple[str, ...]] = ("fyp", "following", "profile", "search", "sound", "share", "other")
ENUM_QA_CHECKS: Final[tuple[str, ...]] = (
    "disclosure_audio",
    "disclosure_onscreen",
    "music_licence",
    "banned_claims",
    "ai_content",
    "duplicate",
    "watermark",
    "brief_beats",
    "safe_zone",
    "aspect_ratio",
    "length",
    "resolution",
    "audio_clarity",
    "moderation",
)
ENUM_FATIGUE_METRICS: Final[tuple[str, ...]] = ("trial_rate", "ctr", "install_rate")

# ── service heuristics (hypotheses until settled posts exist) ────────────────────────────────────

# Hook-type prior: relative trial rate (1.00 = median hook type). Seeded from the blueprint's reading of public
# app-ad advice (confession and risk-reversal hooks lead for installs and trials); replaced per hook type by
# observed settled-post trial rates (``hook_type_stats`` on the request, then the State of App UGC table).
HOOK_TYPE_PRIOR_INDEX: Final[dict[str, float]] = {
    "confession": 1.22,
    "risk_reversal": 1.15,
    "specific_number": 1.08,
    "curiosity_gap": 1.05,
    "direct_question": 0.97,
    "pov": 0.92,
    "pattern_interrupt": 0.90,
}

# Beat order of the six shipped Studio formats plus the five extras (BLUEPRINT: winning app ad formats).
FORMAT_BEATS: Final[dict[str, tuple[str, ...]]] = {
    "tmpl_screen_reaction": ("hook", "app_reveal", "demo", "reaction", "payoff", "cta"),
    "tmpl_hidden_gem": ("hook", "key_feature", "offer", "cta"),
    "tmpl_confession": ("hook", "problem", "demo", "cta"),
    "tmpl_problem_solution": ("problem", "demo", "payoff", "cta"),
    "tmpl_faceless_slideshow": ("hook", "problem", "key_feature", "app_reveal", "payoff", "cta"),
    "tmpl_green_screen": ("hook", "proof", "app_reveal", "demo", "cta"),
    "tmpl_results_update": ("hook", "proof", "key_feature", "payoff", "cta"),
    "tmpl_identity_shift": ("hook", "problem", "app_reveal", "payoff", "cta"),
    "tmpl_free_trial_lead": ("offer", "demo", "payoff", "cta"),
    "tmpl_reply_comment": ("hook", "demo", "payoff", "cta"),
    "tmpl_carousel_video": ("hook", "problem", "app_reveal", "key_feature", "payoff", "cta"),
}
FACELESS_FORMATS: Final[frozenset[str]] = frozenset({"tmpl_faceless_slideshow", "tmpl_carousel_video"})
# Order used when no format is chosen: the generic story arc every format is a cut of.
GENERIC_BEAT_ORDER: Final[tuple[str, ...]] = (
    "hook",
    "problem",
    "app_reveal",
    "demo",
    "key_feature",
    "reaction",
    "proof",
    "payoff",
    "win_state",
    "offer",
    "cta",
    "end_card",
)


class CategoryDefault(TypedDict):
    clearing_cpm_cents: int
    median_fill_hours: float
    median_views: int


# Day-one "fixed defaults by niche" (BLUEPRINT ML #7). Used only when no market series is supplied.
CATEGORY_DEFAULT: Final[dict[str, CategoryDefault]] = {
    "ai_photo": {"clearing_cpm_cents": 240, "median_fill_hours": 31.0, "median_views": 14_200},
    "ai_assistant": {"clearing_cpm_cents": 260, "median_fill_hours": 34.0, "median_views": 12_800},
    "fitness": {"clearing_cpm_cents": 190, "median_fill_hours": 28.0, "median_views": 16_500},
    "language": {"clearing_cpm_cents": 210, "median_fill_hours": 36.0, "median_views": 11_400},
    "productivity": {"clearing_cpm_cents": 180, "median_fill_hours": 33.0, "median_views": 12_100},
    "finance": {"clearing_cpm_cents": 280, "median_fill_hours": 40.0, "median_views": 9_800},
    "sleep_mind": {"clearing_cpm_cents": 200, "median_fill_hours": 30.0, "median_views": 13_300},
    "music_audio": {"clearing_cpm_cents": 170, "median_fill_hours": 29.0, "median_views": 15_700},
    "lifestyle": {"clearing_cpm_cents": 160, "median_fill_hours": 27.0, "median_views": 17_900},
}

CATEGORY_NICHES: Final[dict[str, tuple[str, ...]]] = {
    "ai_photo": ("ai_tools", "tech", "beauty", "lifestyle"),
    "ai_assistant": ("ai_tools", "tech", "productivity", "study"),
    "fitness": ("fitness", "wellness"),
    "language": ("study", "travel"),
    "productivity": ("productivity", "study", "tech"),
    "finance": ("money", "productivity"),
    "sleep_mind": ("wellness", "lifestyle", "parenting"),
    "music_audio": ("tech", "lifestyle"),
    "lifestyle": ("lifestyle", "travel", "food", "parenting", "beauty"),
}

NICHE_ADJACENT: Final[frozenset[frozenset[str]]] = frozenset(
    frozenset(p)
    for p in (
        ("ai_tools", "tech"),
        ("tech", "productivity"),
        ("fitness", "wellness"),
        ("wellness", "lifestyle"),
        ("productivity", "study"),
        ("money", "productivity"),
        ("lifestyle", "beauty"),
        ("lifestyle", "travel"),
        ("lifestyle", "food"),
        ("lifestyle", "parenting"),
        ("food", "parenting"),
        ("wellness", "parenting"),
        ("travel", "food"),
        ("beauty", "wellness"),
        ("study", "tech"),
        ("ai_tools", "productivity"),
    )
)
NICHE_ADJACENT_CREDIT: Final = 0.5
# Share of the niche factor that comes from the embedding when one is available (rules keep the rest).
MATCH_EMBEDDING_SHARE: Final = 0.25

# Day-one QA thresholds.
QA_DISCLOSURE_ONSCREEN_MIN_MS: Final = 2000  # DOMAIN fix hint: keep #ad on screen for 2 seconds
QA_DISCLOSURE_ONSCREEN_WARN_MS: Final = 1000
QA_DISCLOSURE_LATE_RATIO: Final = 0.6  # spoken disclosure after 60% of the video is flagged as late
QA_DEAD_AIR_MS: Final = 1000
QA_ASPECT_TOLERANCE: Final = 0.02
QA_MIN_WIDTH: Final = 720
QA_MIN_HEIGHT: Final = 1280
QA_AI_FAIL_PROBABILITY: Final = 0.7
QA_AI_WARN_PROBABILITY: Final = 0.4
QA_MODERATION_FAIL: Final = 0.8
QA_MODERATION_WARN: Final = 0.5
QA_PHASH_WARN_DISTANCE: Final = 10
QA_BEATS_FAIL_COVERAGE: Final = 0.6
QA_SAFE_ZONE_FAIL_SHARE: Final = 0.3
QA_LOUDNESS_MIN_LUFS: Final = -26.0
QA_LOUDNESS_MAX_LUFS: Final = -8.0
QA_MIN_SPEECH_RATIO: Final = 0.35

# Phrases that are risky for any app regardless of brand (FTC-careful). Brand banned claims fail; these only warn.
PLATFORM_RISKY_CLAIMS: Final[tuple[str, ...]] = (
    "guaranteed income",
    "guaranteed results",
    "get rich",
    "make money while you sleep",
    "cure",
    "cures",
    "doctor approved",
    "clinically proven",
    "no risk",
    "risk free money",
    "instant results",
    "lose weight fast",
)

# Fraud detector shapes (the 10 signals and their max points are the contract's; these are detector thresholds).
FRAUD_SPIKE_RATIO: Final = 10.0
FRAUD_SPIKE_ENGAGEMENT_MAX: Final = 0.005
FRAUD_CAP_NEAR_RATIO: Final = 0.02
FRAUD_CAP_MIN_HITS: Final = 3
FRAUD_BOUGHT_TOP2_SHARE: Final = 0.80
FRAUD_BOUGHT_OTHER_SHARE: Final = 0.60
FRAUD_GEO_SHORTFALL: Final = 0.25
FRAUD_FOLLOWER_RATIO: Final = 40.0
FRAUD_FOLLOWER_MAX: Final = 5_000
FRAUD_NEW_ACCOUNT_DAYS: Final = 30
FRAUD_LIKE_RATIO_MIN: Final = 0.004
FRAUD_LIKE_RATIO_MIN_VIEWS: Final = 1_000
FRAUD_OTHER_SOURCE_MAX: Final = 0.50
FRAUD_FLAT_RUN_HOURS: Final = 24

FATIGUE_DROP_RATIO: Final = 0.30
FATIGUE_WATCH_RATIO: Final = 0.20
FATIGUE_MIN_DAYS: Final = 7
FATIGUE_SMOOTHING_DAYS: Final = 3
