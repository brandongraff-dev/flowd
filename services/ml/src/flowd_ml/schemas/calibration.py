"""Calibration report request/response (admin ML page: predicted band vs realised results)."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import ApiModel, Fix, ModelInfo, ModelStage, Reason, ResponseModel, ScoreBand, Severity

Recommendation = Literal["collect_more_data", "keep", "recalibrate_multipliers", "review_checklist"]


class CalibrationPost(ApiModel):
    post_id: str
    app_id: str
    predicted_band: ScoreBand
    predicted_points: float | None = Field(
        default=None, description="The score behind the band, when there is one; the band index is used otherwise."
    )
    window_views: int = Field(ge=0)
    installs: int = Field(default=0, ge=0)
    trials: int = Field(default=0, ge=0)
    creator_median_views_28d: int | None = Field(default=None, ge=0)


class CalibrationRequest(ApiModel):
    model_name: str = Field(default="creative-scorer", max_length=64)
    model_stage: ModelStage = "heuristic"
    posts: list[CalibrationPost] = Field(min_length=1, max_length=500_000)
    min_posts_per_app: int = Field(default=8, ge=2, le=1000)

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "model_name": "creative-scorer",
                    "model_stage": "heuristic",
                    "posts": [
                        {
                            "post_id": "post_0001",
                            "app_id": "app_lumi",
                            "predicted_band": "A",
                            "predicted_points": 92,
                            "window_views": 31200,
                            "installs": 54,
                            "trials": 4,
                            "creator_median_views_28d": 14200,
                        },
                        {
                            "post_id": "post_0002",
                            "app_id": "app_lumi",
                            "predicted_band": "C",
                            "predicted_points": 61,
                            "window_views": 9800,
                            "installs": 12,
                            "trials": 1,
                            "creator_median_views_28d": 12100,
                        },
                    ],
                }
            ]
        }
    )


class CalibrationBinOut(ResponseModel):
    """One band, realised: the contract's ``CalibrationBin`` plus how it compares with what the band promises."""

    band: ScoreBand
    count: int
    median_views: int
    trial_rate: float = Field(description="Trials per install.")
    median_lift_multiple: float = Field(
        description="Median of views / the creator's own median, so 1.0 is a typical post for that creator."
    )
    expected_multiplier: float = Field(
        description="What the band promises in Pay Math (CONSTANTS.scores.band_view_multiplier)."
    )
    share_of_posts: float


class Finding(ResponseModel):
    severity: Severity
    code: str
    message: str


class Readiness(ResponseModel):
    settled_posts: int
    needed: int
    apps: int
    ready: bool
    remaining: int


class CalibrationReport(ResponseModel):
    model: ModelInfo
    model_name: str
    n_posts: int
    n_apps: int
    bins: list[CalibrationBinOut]
    monotone: bool = Field(
        description="Realised lift never rises as the band falls (A >= B >= C >= D >= E, empty bands ignored)."
    )
    spearman: float | None = Field(
        default=None, description="Mean within-app rank correlation of the score with realised lift."
    )
    top_vs_bottom: float | None = Field(
        default=None, description="Median lift of band A divided by band E (or the nearest populated bands)."
    )
    drift_score: float | None = Field(
        default=None, description="Mean absolute gap between realised and promised multipliers, as a ratio."
    )
    readiness: Readiness
    recommendation: Recommendation
    findings: list[Finding]
    summary: str
    reasons: list[Reason]
    fixes: list[Fix]
    label: str
