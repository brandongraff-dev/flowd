"""Matching request/response models (BLUEPRINT ML system 6: creator history + bounty -> ranked feed)."""

from __future__ import annotations

from pydantic import ConfigDict, Field

from .common import (
    ApiModel,
    Category,
    Country,
    Fix,
    ModelInfo,
    Niche,
    Platform,
    Reason,
    ResponseModel,
    Tier,
)


class PayTerms(ApiModel):
    """A bounty's pay rates, so the service can run Pay Math at the creator's median views."""

    cpm_cents: int = Field(ge=0, le=100_000)
    install_cents: int = Field(default=0, ge=0)
    trial_cents: int = Field(default=0, ge=0)
    paid_cents: int = Field(default=0, ge=0)
    per_video_cap_cents: int = Field(default=25_000, ge=0)


class MatchCreator(ApiModel):
    id: str
    tier: Tier
    country: Country
    niches: list[Niche] = Field(min_length=1, max_length=3)
    platforms_linked: list[Platform] = Field(min_length=0, max_length=3)
    primary_platform: Platform | None = None
    audience_geo: dict[Country, float] | None = Field(
        default=None, description="Audience country mix of the creator's linked accounts (sums to ~1)."
    )
    median_views_28d: int | None = Field(
        default=None, ge=0, description="Used for Pay Math when a bounty gives pay terms."
    )
    usual_pay_cents: int | None = Field(
        default=None, ge=0, description="What this creator usually earns per video. Neutral (1.0) when unknown."
    )
    bio: str = Field(default="", max_length=1000)
    top_hook_words: list[str] = Field(default_factory=list, max_length=20)
    embedding: list[float] | None = Field(
        default=None, max_length=4096, description="Precomputed profile embedding (same model as the bounty embedding)."
    )
    submitted_bounty_ids: list[str] = Field(default_factory=list, max_length=5000)


class MatchBounty(ApiModel):
    id: str
    title: str = ""
    summary: str = Field(default="", max_length=3000, description="Brief TL;DR, embedded when no embedding is given.")
    category: Category | None = None
    niches: list[Niche] = Field(
        default_factory=list, max_length=12, description="Defaults from the category when empty."
    )
    min_tier: Tier | None = None
    countries: list[Country] = Field(default_factory=list, description="Eligible creator countries. Empty = open.")
    platforms: list[Platform] = Field(default_factory=list, description="Allowed platforms. Empty = any.")
    target_countries: list[Country] = Field(default_factory=list, description="Audience regions the brand wants.")
    min_target_audience_ratio: float | None = Field(default=None, ge=0, le=1)
    funded: bool = True
    already_submitted: bool = False
    expected_pay_cents: int | None = Field(
        default=None, ge=0, description="Median expected pay for this creator (Pay Math). Or give pay terms."
    )
    pay: PayTerms | None = None
    brand_reliability: float | None = Field(
        default=None, ge=0, le=100, description="Brand Scorecard score; null = new brand (neutral 70)."
    )
    age_days: float = Field(default=0, ge=0, le=3650)
    embedding: list[float] | None = Field(default=None, max_length=4096)


class MatchRequest(ApiModel):
    creator: MatchCreator
    bounties: list[MatchBounty] = Field(min_length=1, max_length=500)
    limit: int | None = Field(default=None, ge=1, le=500, description="Return at most this many ranked bounties.")
    use_embeddings: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "creator": {
                        "id": "cr_maya",
                        "tier": "silver",
                        "country": "US",
                        "niches": ["ai_tools"],
                        "platforms_linked": ["tiktok"],
                        "primary_platform": "tiktok",
                        "audience_geo": {"US": 0.71, "CA": 0.08},
                        "median_views_28d": 14200,
                        "usual_pay_cents": 3650,
                        "bio": "I test AI photo and video apps so you do not have to.",
                    },
                    "bounties": [
                        {
                            "id": "bnty_lumi_glow",
                            "title": "Glow-up reveal",
                            "summary": "Show the AI photo glow-up in one take.",
                            "category": "ai_photo",
                            "niches": ["ai_tools"],
                            "min_tier": "bronze",
                            "countries": ["US", "CA"],
                            "platforms": ["tiktok", "instagram"],
                            "target_countries": ["US"],
                            "min_target_audience_ratio": 0.5,
                            "funded": True,
                            "expected_pay_cents": 4380,
                            "brand_reliability": 94,
                            "age_days": 2,
                        }
                    ],
                }
            ]
        }
    )


class MatchFactor(ResponseModel):
    key: str
    label: str
    weight: int
    value: float = Field(description="0..1 factor value.")
    points: float = Field(description="weight x value.")
    reason: str


class MatchResult(ResponseModel):
    bounty_id: str
    eligible: bool
    score: int | None = Field(default=None, description="0..100 match score; null when a gate failed.")
    rank: int | None = None
    locked_by: list[str] = Field(
        default_factory=list,
        description="Failed gates (eligibility_tier, country, platform_account_linked, funded, not_already_submitted).",
    )
    factors: list[MatchFactor] = Field(default_factory=list)
    embedding_similarity: float | None = None
    expected_pay_cents: int | None = None
    price_ratio: float | None = None
    reasons: list[Reason]
    summary: str


class MatchResponse(ResponseModel):
    model: ModelInfo
    creator_id: str
    ranked: list[MatchResult]
    locked: list[MatchResult]
    top_pick_bounty_id: str | None = Field(
        default=None, description="The first-ranked bounty, only when it scores at least 60."
    )
    summary: str
    reasons: list[Reason] = Field(
        description="Why the feed looks the way it does: the best matches and what is locked."
    )
    fixes: list[Fix] = Field(
        description="What the creator can do to unlock or improve matches (link an account, reach a tier)."
    )
