"""Pricing request/response models (BLUEPRINT ML system 7: bounty + live market -> suggested CPM and fill time)."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import ApiModel, Category, Fix, ModelInfo, Plan, Reason, ResponseModel

Priority = Literal["balanced", "fastest", "cheapest"]
BountyType = Literal["cpm", "cpa", "install_only", "stacked"]


class MarketStats(ApiModel):
    """One category's market snapshot (the latest ``market_series`` row, DOMAIN.md ``MarketSeriesPoint``)."""

    clearing_cpm_cents: int = Field(
        gt=0, le=100_000, description="Median CPM of bounties that filled or are receiving submissions."
    )
    p25_cpm_cents: int | None = Field(default=None, gt=0, le=100_000)
    p75_cpm_cents: int | None = Field(default=None, gt=0, le=100_000)
    median_fill_hours: float = Field(gt=0, le=24 * 60, description="Median fill hours at the clearing price.")
    sample_n: int = Field(ge=0, le=10_000_000, description="Comparable bounties behind these numbers.")
    median_views: int | None = Field(default=None, ge=0, description="Median verified views per post in the category.")
    trial_rate: float | None = Field(default=None, ge=0, le=1)


class CpaRates(ApiModel):
    install_cents: int = Field(default=0, ge=0)
    trial_cents: int = Field(default=0, ge=0)
    paid_cents: int = Field(default=0, ge=0)


class SuggestCpmRequest(ApiModel):
    category: Category
    market: MarketStats | None = Field(
        default=None, description="Omit to use the day-one category defaults (labelled as such)."
    )
    plan: Plan = "free"
    bounty_type: BountyType | None = None
    first_bounty: bool = Field(
        default=False, description="First bounty: fee waived, flowd matches up to $500 on top of budget_cents."
    )
    budget_cents: int | None = Field(
        default=None,
        ge=0,
        le=100_000_000,
        description="Creator-pay pool. For a first bounty: what the brand funds (flowd matches on top).",
    )
    per_video_cap_cents: int = Field(default=25_000, ge=0, le=1_000_000)
    cpa: CpaRates | None = None
    priority: Priority = "balanced"
    target_fill_hours: float | None = Field(
        default=None, gt=0, le=24 * 60, description="Overrides priority: the fill time the brand wants."
    )
    candidate_cpm_cents: int | None = Field(
        default=None, gt=0, le=100_000, description="The brand's own price: where does it land?"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "category": "ai_photo",
                    "market": {
                        "clearing_cpm_cents": 240,
                        "p25_cpm_cents": 190,
                        "p75_cpm_cents": 310,
                        "median_fill_hours": 31,
                        "sample_n": 38,
                        "median_views": 14200,
                    },
                    "plan": "pro",
                    "budget_cents": 500_000,
                    "per_video_cap_cents": 25_000,
                    "cpa": {"install_cents": 40, "trial_cents": 150, "paid_cents": 400},
                    "priority": "balanced",
                    "candidate_cpm_cents": 192,
                }
            ]
        }
    )


class CurvePoint(ResponseModel):
    cpm_cents: int
    multiplier: float
    fill_hours_p50: float
    fill_hours_p80: float
    confidence: float
    vs_clearing_pct: int = Field(description="Price against the clearing CPM, in percent (+20 = 20% above).")
    all_in_cpm_cents: int | None = Field(
        default=None,
        description="What the brand pays per 1,000 verified views incl. fee and processing, when a budget is given.",
    )
    sample_n: int


class CpmRange(ResponseModel):
    low_cpm_cents: int
    high_cpm_cents: int
    basis: Literal["market_p25_p75", "clearing_band"]


class FillEstimate(ResponseModel):
    p50_hours: float
    p80_hours: float
    confidence: float


class CandidateAssessment(ResponseModel):
    cpm_cents: int
    position: Literal["below_market", "at_market", "above_market"]
    vs_clearing_pct: int
    fill: FillEstimate
    message: str


class AllInPrice(ResponseModel):
    budget_cents: int
    take_rate: float
    fee_reserve_cents: int
    escrow_total_cents: int
    matched_cents: int
    brand_funded_cents: int
    processing_cents: int
    card_charge_cents: int
    all_in_cpm_cents: int


class CreatorPay(ResponseModel):
    """What a typical creator earns per video at the suggested CPM (Pay Math, an estimate)."""

    label: str = "Estimate"
    median_views: int
    p25_cents: int
    median_cents: int
    p75_cents: int
    capped_at_p75: bool


class PriceSuggestion(ResponseModel):
    model: ModelInfo
    category: Category
    source: Literal["market", "category_default"]
    suggested_cpm_cents: int
    clearing_cpm_cents: int
    range: CpmRange
    fill: FillEstimate
    thin_market: bool
    sample_n: int
    curve: list[CurvePoint]
    candidate: CandidateAssessment | None = None
    all_in: AllInPrice | None = None
    creator_pay: CreatorPay | None = None
    summary: str
    reasons: list[Reason]
    fixes: list[Fix]
    warnings: list[str]
