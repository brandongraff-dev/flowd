"""Auto-QA request/response models (BLUEPRINT ML system 3: brief + transcript + hashes -> pass / flags)."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import (
    AiContentPolicy,
    ApiModel,
    BeatHit,
    BeatId,
    Evidence,
    Fix,
    KnownHash,
    ModelInfo,
    MusicPolicy,
    OnScreenText,
    QaCheckType,
    QaResult,
    Reason,
    ResponseModel,
    SceneCut,
    TranscriptSegment,
)

QaVerdict = Literal["pass", "warn", "fail"]


class BriefBeatIn(ApiModel):
    beat: BeatId
    label: str = ""
    required: bool = True
    hint: str | None = None


class QaBrief(ApiModel):
    """The slice of the bounty brief that QA checks against (the contract's ``Brief`` + ``Deliverables`` + compliance defaults)."""

    beats: list[BriefBeatIn] = Field(default_factory=list, max_length=32)
    talking_points: list[str] = Field(default_factory=list, max_length=32)
    cta: str = ""
    offer_line: str | None = None
    disclosure_text: str = Field(default="#ad", description='Required wording, e.g. "#ad Paid partnership with Lumi".')
    banned_claims: list[str] = Field(default_factory=list, max_length=200)
    competitor_names: list[str] = Field(default_factory=list, max_length=100)
    app_name: str | None = None
    brand_name: str | None = None
    music_policy: MusicPolicy = "commercial_library"
    ai_policy: AiContentPolicy = "allowed_disclosed"
    require_face: bool = False
    min_duration_s: int = Field(default=15, ge=0, le=600)
    max_duration_s: int = Field(default=60, ge=1, le=600)
    aspect: str = "9:16"


class QaMedia(ApiModel):
    duration_ms: int = Field(ge=0, le=3_600_000)
    width: int | None = Field(default=None, ge=1, le=16384)
    height: int | None = Field(default=None, ge=1, le=16384)


class QaAudio(ApiModel):
    """Audio analysis (ffmpeg silencedetect / ebur128 on the real worker). Any field may be omitted."""

    music_detected: bool | None = None
    music_licensed: bool | None = Field(default=None, description="Matches a commercial-library track. null = unknown.")
    dead_air_gaps_ms: list[int] | None = Field(
        default=None, max_length=500, description="Durations of silences inside speech."
    )
    speech_ratio: float | None = Field(default=None, ge=0, le=1)
    loudness_lufs: float | None = Field(default=None, ge=-80, le=10)
    clipping: bool | None = None


class QaVision(ApiModel):
    """Per-video signals from the vision-language model. Any field may be omitted."""

    watermarks: list[str] | None = Field(default=None, max_length=50, description="Overlay logos or watermarks seen.")
    competitor_logos: list[str] | None = Field(default=None, max_length=50)
    ai_generated_probability: float | None = Field(default=None, ge=0, le=1)
    moderation: dict[str, float] | None = Field(
        default=None, description="Category -> score 0..1 from the moderation model."
    )
    beat_hits: list[BeatHit] | None = Field(
        default=None, description="Beats the VLM already located (overrides the keyword rules)."
    )
    face_ms: int | None = Field(
        default=None, ge=0, le=3_600_000, description="First frame with a face (for the face-required check)."
    )


class QaRequest(ApiModel):
    submission_id: str | None = None
    creator_id: str | None = None
    media: QaMedia
    transcript: list[TranscriptSegment] = Field(default_factory=list, max_length=2000)
    on_screen_text: list[OnScreenText] = Field(default_factory=list, max_length=2000)
    scenes: list[SceneCut] = Field(default_factory=list, max_length=1000)
    audio: QaAudio | None = None
    vision: QaVision | None = None
    brief: QaBrief = Field(default_factory=QaBrief)
    phash: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{16}$")
    known_hashes: list[KnownHash] = Field(default_factory=list, max_length=100_000)
    checks: list[QaCheckType] | None = Field(
        default=None, description="Run only these checks. Default: every check that has input."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "submission_id": "sub_0412",
                    "media": {"duration_ms": 24000, "width": 1080, "height": 1920},
                    "transcript": [
                        {"t_start_ms": 300, "t_end_ms": 2100, "text": "I was wrong about AI photo apps."},
                        {
                            "t_start_ms": 2200,
                            "t_end_ms": 4800,
                            "text": "This is a paid partnership with Lumi, and look at this.",
                        },
                        {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Try it free for seven days, link in bio."},
                    ],
                    "on_screen_text": [
                        {
                            "t_start_ms": 400,
                            "t_end_ms": 2400,
                            "text": "I was wrong about AI photo apps",
                            "in_safe_zone": True,
                        },
                        {
                            "t_start_ms": 2500,
                            "t_end_ms": 5000,
                            "text": "#ad Paid partnership with Lumi",
                            "in_safe_zone": True,
                        },
                    ],
                    "brief": {
                        "beats": [
                            {"beat": "hook", "required": True},
                            {"beat": "app_reveal", "required": True},
                            {"beat": "cta", "required": True},
                        ],
                        "disclosure_text": "#ad Paid partnership with Lumi",
                        "banned_claims": ["guaranteed results"],
                        "cta": "Link in bio",
                        "app_name": "Lumi",
                        "brand_name": "Lumi",
                    },
                }
            ]
        }
    )


class QaCheckOut(ResponseModel):
    """One automated QA check result (the contract's ``QaCheck``)."""

    check: QaCheckType
    result: QaResult
    message: str
    evidence: Evidence | None = None
    blocks_settlement: bool = False
    reason_code: str | None = Field(
        default=None, description="The reason code a reviewer would use if they act on this check."
    )


class QaFlag(ResponseModel):
    """A non-passing check, written for the creator and the reviewer."""

    check: QaCheckType
    result: QaResult
    reason_code: str
    label: str
    message: str
    creator_copy: str
    fix: str
    evidence: Evidence | None = None
    blocks_settlement: bool = False
    t_ms: int | None = None


class QaResponse(ResponseModel):
    model: ModelInfo
    verdict: QaVerdict = Field(
        description="pass = every check passed; warn = a human decides; fail = blocks auto-approve."
    )
    passed: bool
    auto_approvable: bool = Field(
        description="True only when every check ran and passed. Guarded auto-approve also needs Flow band and fraud limits."
    )
    blocks_settlement: bool = Field(description="A disclosure failure blocks settlement until fixed.")
    summary: str
    checks: list[QaCheckOut]
    flags: list[QaFlag]
    skipped: list[QaCheckType] = Field(description="Checks that had no input and did not run.")
    beats: list[BeatHit]
    suggested_reason_code: str | None = None
    reasons: list[Reason]
    fixes: list[Fix]
