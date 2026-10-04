"""Hook Score and Flow Score request/response models."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from .common import (
    ApiModel,
    BeatId,
    Fix,
    FormatId,
    HookType,
    ModelInfo,
    Reason,
    ResponseModel,
    ScoreBand,
    ScoreCard,
    ScoreItem,
)

FormatOrder = Literal["in_order", "one_off", "out_of_order"]


class HookFeatures(ApiModel):
    """First-3-seconds observations. All times are milliseconds from the first frame; ``null`` means it never happens.

    These are exactly the ``obs`` fields of the contract's ``scoreHook`` (``packages/contract/schema/formulas.mjs``);
    ``hook_type`` is an addition that lets the service work out ``hook_type_known`` / ``hook_type_above_median`` itself.
    """

    lands_ms: int | None = Field(default=None, ge=0, le=600_000, description="When the hook line lands.")
    onscreen_ms: int | None = Field(
        default=None, ge=0, le=600_000, description="When hook text first appears on screen."
    )
    spoken_matches_onscreen: bool = Field(default=False, description="The on-screen hook text mirrors the spoken hook.")
    face_ms: int | None = Field(default=None, ge=0, le=600_000, description="First frame with a face.")
    faceless: bool = Field(
        default=False, description="Faceless format (slideshow, screen-only): a face is not required."
    )
    app_ms: int | None = Field(
        default=None, ge=0, le=600_000, description="First frame where the app or product is visible."
    )
    interrupt_ms: int | None = Field(
        default=None, ge=0, le=600_000, description="First cut, zoom or motion pattern interrupt."
    )
    hook_type: HookType | None = Field(default=None, description="Library hook type of the opener, if it is one.")
    hook_type_known: bool | None = Field(
        default=None, description="Is the opener a library hook type? Derived from hook_type when omitted."
    )
    hook_type_above_median: bool | None = Field(
        default=None,
        description="Does the hook type have an above-median trial rate? Derived from stats or the day-one prior when omitted.",
    )
    speech_ms: int | None = Field(default=None, ge=0, le=600_000, description="When speech starts.")
    captions_in_safe_zone: bool = Field(
        default=False, description="Captions are burned in and inside the platform safe zones."
    )


class HookScoreRequest(HookFeatures):
    hook_type_stats: dict[HookType, float] | None = Field(
        default=None,
        description="Observed trial rate per hook type (State of App UGC). Overrides the day-one prior for 'above median'.",
    )
    creator_median_views: int | None = Field(
        default=None, ge=0, description="The creator's 28-day median views, for the views estimate."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "lands_ms": 2400,
                    "onscreen_ms": 900,
                    "spoken_matches_onscreen": True,
                    "face_ms": 300,
                    "faceless": False,
                    "app_ms": 2800,
                    "interrupt_ms": 1200,
                    "hook_type": "confession",
                    "speech_ms": 400,
                    "captions_in_safe_zone": True,
                    "creator_median_views": 14200,
                }
            ]
        }
    )


class NextBand(ResponseModel):
    band: ScoreBand
    points_needed: int


class ViewsEstimate(ResponseModel):
    """Predicted views for this creator and band: median views x the band multiplier. Always an estimate."""

    label: str = "Estimate"
    band_multiplier: float
    creator_median_views: int
    predicted_views: int
    installs_per_1000_views: float = Field(
        description="Funnel-default installs per 1,000 views (not band-adjusted on day one)."
    )
    note: str


class HookScoreResponse(ResponseModel):
    model: ModelInfo
    band: ScoreBand
    points: int
    items: list[ScoreItem]
    label: str
    summary: str
    reasons: list[Reason]
    fixes: list[Fix]
    next_band: NextBand | None = None
    best_band_if_all_fixed: ScoreBand
    resolved_features: HookFeatures
    predicted: ViewsEstimate | None = None


class BeatObservation(ApiModel):
    beat: BeatId
    required: bool = True
    found: bool
    t_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class FlowFeatures(ApiModel):
    """Whole-video observations (the contract's ``scoreFlow`` obs). Give ``hook_points`` or the ``hook`` features, and
    ``beats_found``/``beats_required`` or the ``beats`` list."""

    hook_points: int | None = Field(
        default=None, ge=0, le=100, description="Hook Score points (0..100), when already computed."
    )
    hook: HookFeatures | None = Field(
        default=None, description="Hook features: the service computes the Hook Score itself."
    )
    beats_found: int | None = Field(default=None, ge=0, le=64)
    beats_required: int | None = Field(default=None, ge=0, le=64)
    beats: list[BeatObservation] | None = Field(
        default=None, max_length=64, description="Per-beat observations; counts are derived."
    )
    app_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    disclosure_audio: bool = False
    disclosure_onscreen: bool = False
    duration_s: float = Field(ge=0, le=3600)
    captions_in_safe_zone: bool = False
    single_cta: bool = False
    ends_on_win_state: bool = False
    audio_gaps: int = Field(default=0, ge=0, le=500, description="Dead-air gaps over 1.0 s.")
    format_order: FormatOrder = "in_order"
    format_id: FormatId | None = Field(
        default=None, description="The chosen Studio format, for the format-fit explanation."
    )

    @model_validator(mode="after")
    def _needs_hook_and_beats(self) -> FlowFeatures:
        if (self.hook_points is None) == (self.hook is None):
            raise ValueError("give exactly one of hook_points or hook")
        has_counts = self.beats_found is not None or self.beats_required is not None
        if self.beats is None and (self.beats_found is None or self.beats_required is None):
            raise ValueError("give beats, or both beats_found and beats_required")
        if self.beats is not None and has_counts:
            raise ValueError("give beats or the beats_found/beats_required counts, not both")
        return self


class FlowScoreRequest(FlowFeatures):
    creator_median_views: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "hook_points": 90,
                    "beats_found": 4,
                    "beats_required": 5,
                    "app_ms": 2800,
                    "disclosure_audio": True,
                    "disclosure_onscreen": True,
                    "duration_s": 24,
                    "captions_in_safe_zone": True,
                    "single_cta": True,
                    "ends_on_win_state": True,
                    "audio_gaps": 0,
                    "format_order": "in_order",
                    "creator_median_views": 14200,
                }
            ]
        }
    )


class ShadowPrediction(ResponseModel):
    """A learned model's answer, computed beside the checklist. Shadow means: logged and compared, never shown to users."""

    stage: Literal["shadow"] = "shadow"
    model_version: str
    band: ScoreBand
    predicted_lift_multiple: float = Field(
        description="Predicted views as a multiple of this creator's own median (1.0 = typical)."
    )
    reasons: list[Reason]
    note: str = "Computed beside the checklist score for comparison. Not shown to users until it beats the checklist on held-out apps."


class FlowScoreResponse(ResponseModel):
    model: ModelInfo
    band: ScoreBand
    points: int
    items: list[ScoreItem]
    label: str
    summary: str
    reasons: list[Reason]
    fixes: list[Fix]
    next_band: NextBand | None = None
    best_band_if_all_fixed: ScoreBand
    hook_score: ScoreCard | None = Field(
        default=None, description="Present when the Hook Score was computed from hook features."
    )
    resolved: dict[str, float | int | bool | str | None] = Field(
        description="The scalar observations that were scored."
    )
    predicted: ViewsEstimate | None = None
    shadow: ShadowPrediction | None = Field(
        default=None, description="Present only when a learned model is loaded in shadow and hook features were given."
    )
