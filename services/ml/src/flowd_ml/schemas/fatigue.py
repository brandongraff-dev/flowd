"""Fatigue detection (BLUEPRINT ML system 8): refresh alert when a winner's rate falls 30% from its peak."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import ApiModel, FatigueMetric, Fix, ModelInfo, Reason, ResponseModel

FatigueState = Literal["healthy", "watch", "fatigued", "insufficient_data"]


class DailyValue(ApiModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="UTC date, YYYY-MM-DD.")
    value: float = Field(ge=0, description="The metric that day (a ratio, e.g. trials per install).")
    volume: int | None = Field(
        default=None,
        ge=0,
        description="Denominator that day (installs for trial_rate, impressions for ctr, views for install_rate).",
    )


class FatigueRequest(ApiModel):
    metric: FatigueMetric = "trial_rate"
    series: list[DailyValue] = Field(min_length=1, max_length=400)
    min_volume: int = Field(default=30, ge=0, description="Days with less volume than this are too noisy to count.")
    post_id: str | None = None
    ad_id: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "metric": "trial_rate",
                    "post_id": "post_0412",
                    "series": [
                        {"date": f"2026-09-{d:02d}", "value": v, "volume": 90}
                        for d, v in zip(
                            range(19, 31),
                            [0.071, 0.074, 0.078, 0.080, 0.077, 0.072, 0.066, 0.061, 0.056, 0.052, 0.050, 0.049],
                            strict=True,
                        )
                    ],
                }
            ]
        }
    )


class FatigueResponse(ResponseModel):
    model: ModelInfo
    state: FatigueState
    metric: FatigueMetric
    peak_value: float | None = None
    peak_on: str | None = None
    current_value: float | None = None
    drop_ratio: float | None = Field(default=None, description="1 - current / peak. 0.30 or more triggers the alert.")
    days_since_peak: int | None = None
    message: str
    reasons: list[Reason]
    fixes: list[Fix]
