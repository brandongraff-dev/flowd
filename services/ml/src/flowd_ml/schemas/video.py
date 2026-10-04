"""analyze-video request/response models. The response's core fields are the contract's ``VideoAnalysis`` (DOMAIN.md)."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import (
    ApiModel,
    BeatHit,
    CtaType,
    Fix,
    FormatId,
    HookType,
    KnownHash,
    ModelInfo,
    OnScreenText,
    Reason,
    ResponseModel,
    SceneCut,
    ScoreCard,
    TranscriptSegment,
)
from .qa import QaBrief, QaCheckOut, QaVerdict
from .scores import FlowFeatures, HookFeatures, ViewsEstimate


class VideoRefIn(ApiModel):
    uri: str = Field(
        min_length=1,
        max_length=2048,
        description="`fake://<scenario>[?seed=n]` for the fake adapters, or a path / URL / object key for the real ones.",
    )
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    duration_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    width: int | None = Field(default=None, ge=1, le=16384)
    height: int | None = Field(default=None, ge=1, le=16384)


class AnalyzeOptions(ApiModel):
    frame_interval_ms: int = Field(
        default=500,
        ge=100,
        le=5000,
        description="Frame spacing inside the first 6 seconds (the hook). Later frames are sampled every 2 seconds.",
    )
    max_frames: int = Field(default=80, ge=4, le=200)
    include_embedding: bool = Field(
        default=False, description="Return the embedding vector itself (large). Its model and size are always returned."
    )
    run_qa: bool = True


class AnalyzeVideoRequest(ApiModel):
    submission_id: str | None = Field(default=None, examples=["sub_0412"])
    version: int = Field(default=1, ge=1, le=99)
    video: VideoRefIn
    brief: QaBrief | None = Field(
        default=None, description="The bounty brief. Without one, QA runs the brief-independent checks only."
    )
    format_id: FormatId | None = Field(
        default=None, description="The Studio format the creator chose; inferred from the beats when omitted."
    )
    known_hashes: list[KnownHash] = Field(default_factory=list, max_length=100_000)
    creator_median_views: int | None = Field(default=None, ge=0)
    options: AnalyzeOptions = Field(default_factory=AnalyzeOptions)

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "submission_id": "sub_0412",
                    "version": 2,
                    "video": {"uri": "fake://strong_screen_reaction?seed=412"},
                    "brief": {
                        "beats": [
                            {"beat": "hook", "required": True},
                            {"beat": "app_reveal", "required": True},
                            {"beat": "demo", "required": True},
                            {"beat": "cta", "required": True},
                        ],
                        "disclosure_text": "#ad Paid partnership with Lumi",
                        "banned_claims": ["guaranteed results"],
                        "cta": "Link in bio",
                        "app_name": "Lumi",
                        "brand_name": "Lumi",
                        "min_duration_s": 15,
                        "max_duration_s": 60,
                    },
                    "creator_median_views": 14200,
                }
            ]
        }
    )


class HookAnalysis(ResponseModel):
    """First-3-seconds analysis (the contract's ``HookAnalysis``). ``hook_type`` is null when the opener is not a library hook type."""

    text: str
    hook_type: HookType | None = None
    lands_at_ms: int | None = None
    face_at_ms: int | None = None
    app_at_ms: int | None = None
    caption_at_ms: int | None = None
    spoken_matches_onscreen: bool = False


class VideoTags(ResponseModel):
    """Tags added to every settled post (Creative Intelligence Library)."""

    format_id: FormatId | None = None
    hook_type: HookType | None = None
    hook_words: str = ""
    time_to_app_reveal_ms: int | None = None
    cta_type: CtaType | None = None


class EmbeddingInfo(ResponseModel):
    model: str
    dim: int
    vector: list[float] | None = None


class QaSummary(ResponseModel):
    verdict: QaVerdict
    passed: bool
    auto_approvable: bool
    blocks_settlement: bool
    suggested_reason_code: str | None = None
    summary: str
    skipped: list[str] = Field(default_factory=list)


class AnalyzeVideoResponse(ResponseModel):
    """The contract's ``VideoAnalysis`` plus explanations, the QA summary, and which adapters produced it."""

    id: str = Field(description="va_<submission number>_v<version>")
    model: ModelInfo
    submission_id: str | None = None
    version: int
    duration_ms: int
    language: str
    transcript: list[TranscriptSegment]
    transcript_text: str
    on_screen_text: list[OnScreenText]
    scenes: list[SceneCut]
    hook: HookAnalysis
    beats: list[BeatHit]
    tags: VideoTags
    checks: list[QaCheckOut]
    hook_score: ScoreCard
    flow_score: ScoreCard
    phash: str = Field(description="16 hex characters: perceptual hash for duplicate detection.")
    duplicate_of_submission_id: str | None = None
    analysed_at: str
    # beyond the contract
    qa: QaSummary | None = None
    hook_features: HookFeatures
    flow_features: FlowFeatures
    predicted: ViewsEstimate | None = None
    reasons: list[Reason]
    fixes: list[Fix]
    summary: str
    embedding: EmbeddingInfo
    adapters: dict[str, str]
    stage: Literal["fake", "real"]
    timings_ms: dict[str, float]
    warnings: list[str]
