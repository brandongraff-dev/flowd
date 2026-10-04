"""View-fraud request/response models (BLUEPRINT ML system 4: view curves + account history -> risk score)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from .common import (
    ApiModel,
    Country,
    CurveShape,
    Fix,
    FraudAction,
    FraudBand,
    KnownHash,
    ModelInfo,
    Reason,
    ResponseModel,
    TrafficSource,
)

SignalStatus = Literal["fired", "clear", "no_data"]
FraudSignalName = Literal[
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


class ViewPoint(ApiModel):
    """A cumulative view count at a time since posting (a View Ledger snapshot)."""

    t_hours: float = Field(ge=0, le=24 * 400)
    views: int = Field(ge=0)


class FraudPost(ApiModel):
    views: int = Field(ge=0, description="Reported views at assessment time.")
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    saves: int = Field(default=0, ge=0)
    hourly_views: list[int] | None = Field(
        default=None, max_length=24 * 120, description="Hourly view deltas, hour 0 = the first hour after posting."
    )
    snapshots: list[ViewPoint] | None = Field(
        default=None,
        max_length=2000,
        description="Cumulative snapshots; used when hourly_views is absent (6-hour resolution in the View Ledger).",
    )
    traffic_sources: dict[TrafficSource, float] | None = Field(
        default=None, description="Share of views by source (sums to ~1)."
    )
    geo: dict[Country, float] | None = Field(default=None, description="Audience country mix (sums to ~1).")
    baseline_hourly_views: float | None = Field(
        default=None, gt=0, description="Override the post baseline (default: median hourly views)."
    )


class FraudAccount(ApiModel):
    followers: int | None = Field(default=None, ge=0)
    account_age_days: float | None = Field(default=None, ge=0)
    comment_ratio_mean_28d: float | None = Field(default=None, ge=0, le=1)
    comment_ratio_sd_28d: float | None = Field(default=None, ge=0, le=1)


class FraudBounty(ApiModel):
    target_countries: list[Country] = Field(default_factory=list)
    min_target_audience_ratio: float | None = Field(
        default=None, ge=0, le=1, description="Defaults to 0.5 when target countries are given."
    )
    per_video_cap_cents: int | None = Field(default=None, ge=0)
    cpm_cents: int | None = Field(default=None, ge=0)


class FraudHistoryPost(ApiModel):
    earnings_cents: int = Field(ge=0)
    cap_cents: int | None = Field(default=None, ge=0)


class FraudDuplicate(ApiModel):
    phash_distance: int | None = Field(default=None, ge=0, le=64)
    duplicate_of: str | None = None
    kind: Literal["other_creator", "own_earlier"] = "other_creator"


class PrecomputedSignal(ApiModel):
    signal: FraudSignalName
    severity: float = Field(ge=0, le=1)
    detail: str | None = None


class FraudRequest(ApiModel):
    post_id: str | None = None
    post: FraudPost | None = None
    account: FraudAccount | None = None
    bounty: FraudBounty | None = None
    history: list[FraudHistoryPost] = Field(
        default_factory=list, max_length=50, description="The creator's most recent posts, newest first."
    )
    duplicate: FraudDuplicate | None = Field(
        default=None, description="A perceptual-hash comparison already made elsewhere."
    )
    phash: str | None = Field(
        default=None,
        pattern=r"^[0-9a-fA-F]{16}$",
        description="This video's hash; compared against known_hashes when duplicate is absent.",
    )
    known_hashes: list[KnownHash] = Field(default_factory=list, max_length=100_000)
    precomputed_signals: list[PrecomputedSignal] | None = Field(
        default=None,
        description="Compose a score from signals computed elsewhere (Ops overrides, the contract engines). Skips detection.",
    )

    @model_validator(mode="after")
    def _needs_something(self) -> FraudRequest:
        if (
            self.precomputed_signals is None
            and self.post is None
            and self.duplicate is None
            and self.phash is None
            and not self.history
            and self.account is None
        ):
            raise ValueError("give post evidence, account history, a duplicate match, or precomputed_signals")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "post_id": "post_0912",
                    "post": {
                        "views": 61_200,
                        "likes": 140,
                        "comments": 6,
                        "shares": 11,
                        "saves": 20,
                        "hourly_views": [120, 380, 54_000, 5_100, 300, 280, 250, 230, 210, 200, 190, 180],
                        "traffic_sources": {"fyp": 0.28, "following": 0.06, "other": 0.62, "profile": 0.04},
                        "geo": {"US": 0.31, "BR": 0.33, "PH": 0.36},
                    },
                    "account": {"followers": 1_900, "account_age_days": 19},
                    "bounty": {
                        "target_countries": ["US"],
                        "min_target_audience_ratio": 0.5,
                        "per_video_cap_cents": 25_000,
                        "cpm_cents": 200,
                    },
                    "history": [
                        {"earnings_cents": 24_700, "cap_cents": 25_000},
                        {"earnings_cents": 24_900, "cap_cents": 25_000},
                        {"earnings_cents": 2_100, "cap_cents": 25_000},
                    ],
                }
            ]
        }
    )


class CurveSummary(ResponseModel):
    hours: int
    total_views: int
    peak_hour: int
    peak_views: int
    baseline_hourly_views: float
    spike_ratio: float
    top2_bucket_share: float
    flat_run_hours: int
    decay_ratio: float | None = None
    shape: CurveShape


class SignalOutcome(ResponseModel):
    """One of the ten signals, fired or not, with the numbers it looked at."""

    signal: FraudSignalName
    label: str
    status: SignalStatus
    severity: float
    points: int
    max_points: int
    detail: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class FraudSignalHit(ResponseModel):
    """A fired signal (the contract's ``FraudSignalHit``): points = round(max_points x severity)."""

    signal: FraudSignalName
    severity: float
    points: int
    detail: str


class FraudResponse(ResponseModel):
    model: ModelInfo
    score: int = Field(description="min(100, sum of signal points)")
    band: FraudBand
    action: FraudAction
    review_sla_hours: int | None = Field(
        default=None, description="Human review deadline for band review; null otherwise."
    )
    summary: str
    signals: list[FraudSignalHit]
    checked: list[SignalOutcome]
    curve: CurveSummary | None = None
    reasons: list[Reason]
    fixes: list[Fix] = Field(description="Next steps for the reviewer, most useful first.")
    note: str = Field(description="Only proven fraud is clawed back; delivered legitimate views are still paid.")
