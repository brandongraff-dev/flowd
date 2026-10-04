"""Shared API vocabulary: enums (as Literals, mirroring DOMAIN.md), explainability envelope, video primitives.

Explainability is first-class. Every response carries:

* ``model``    which model produced it, its version and stage (heuristic / shadow / learned);
* ``reasons``  ordered plain-English reasons, each with a severity, a timecode when one exists, and its impact;
* ``fixes``    ordered, concrete next steps with the points or risk they would change.

Nothing here is a bare number.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    """Request models reject unknown fields: a typo is a 422 with the field path, never a silently ignored input."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True, protected_namespaces=())


# ── enums (DOMAIN.md section 5) ─────────────────────────────────────────────────────────────────
ScoreBand = Literal["A", "B", "C", "D", "E"]
HookType = Literal[
    "confession", "curiosity_gap", "specific_number", "pov", "direct_question", "risk_reversal", "pattern_interrupt"
]
BeatId = Literal[
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
]
FormatId = Literal[
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
]
CtaType = Literal["link_in_bio", "use_code", "try_free", "download_now", "search_app_store", "comment_for_link"]
SceneKind = Literal["face", "screen_recording", "broll", "text_card", "slide"]
Platform = Literal["tiktok", "instagram", "youtube"]
Category = Literal[
    "ai_photo",
    "ai_assistant",
    "fitness",
    "language",
    "productivity",
    "finance",
    "sleep_mind",
    "music_audio",
    "lifestyle",
]
Niche = Literal[
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
]
Country = Literal["US", "CA", "GB", "AU", "IE", "DE", "FR", "ES", "NL", "BR", "MX", "PH"]
Tier = Literal["bronze", "silver", "gold", "platinum", "elite"]
Plan = Literal["free", "pro", "scale"]
TrafficSource = Literal["fyp", "following", "profile", "search", "sound", "share", "other"]
MusicPolicy = Literal["original_only", "commercial_library"]
AiContentPolicy = Literal["not_allowed", "allowed_disclosed"]
QaCheckType = Literal[
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
]
QaResult = Literal["pass", "warn", "fail"]
EvidenceKind = Literal["timecode", "qa_check", "brief_requirement", "transcript"]
FraudBand = Literal["clean", "watch", "review", "high"]
FraudAction = Literal["auto_clear", "hold_for_human_review", "auto_hold_and_queue"]
CurveShape = Literal["organic", "spiky", "flat", "stepped"]
ModelKind = Literal[
    "video_understanding",
    "hook_coach",
    "auto_qa",
    "fraud",
    "creative_scorer",
    "matching",
    "pricing",
    "fatigue",
]
ModelStage = Literal["heuristic", "shadow", "learned"]
Severity = Literal["positive", "info", "warning", "critical"]
FatigueMetric = Literal["trial_rate", "ctr", "install_rate"]


# ── explainability envelope ─────────────────────────────────────────────────────────────────────
class ModelInfo(ResponseModel):
    """Which model answered. ``stage`` is ``heuristic`` for every day-one model."""

    name: str = Field(examples=["hook-score"])
    kind: ModelKind
    version: str = Field(examples=["heuristic-1.0.0"])
    stage: ModelStage = "heuristic"


class Evidence(ResponseModel):
    """What a flag points at (matches the contract's ``Evidence``): a timecode, a QA check, a brief line or a transcript line."""

    kind: EvidenceKind
    ref: str = Field(description='A timecode "0:03", a QaCheckType, a quoted brief requirement or a transcript line.')
    excerpt: str | None = None
    t_ms: int | None = None


class Reason(ResponseModel):
    """One plain-English reason behind a result."""

    code: str = Field(description="Stable machine code: checklist item id, fraud signal, QA check or match factor.")
    severity: Severity
    title: str | None = Field(default=None, description="Short label, e.g. the checklist line this reason belongs to.")
    message: str
    t_ms: int | None = Field(default=None, description="Position in the video the reason refers to, when it has one.")
    impact: float | None = Field(
        default=None,
        description="Points this reason cost versus a perfect result (negative), or points of risk it added (positive, fraud). Null when not a points model.",
    )
    evidence: Evidence | None = None


class Fix(ResponseModel):
    """One concrete next step."""

    id: str
    text: str
    target: str | None = Field(default=None, description="The item, signal or check this fixes.")
    gain: float | None = Field(
        default=None, description="Points (or risk points removed) if this one fix is applied alone."
    )
    band_after: str | None = Field(default=None, description="Band if only this fix is applied.")
    effort: Literal["quick", "moderate", "reshoot"] | None = None
    t_ms: int | None = None


# ── video primitives (DOMAIN.md value types) ────────────────────────────────────────────────────
class TranscriptSegment(ApiModel):
    t_start_ms: int = Field(ge=0, le=3_600_000)
    t_end_ms: int = Field(ge=0, le=3_600_000)
    text: str = Field(max_length=2000)


class OnScreenText(ApiModel):
    t_start_ms: int = Field(ge=0, le=3_600_000)
    t_end_ms: int = Field(ge=0, le=3_600_000)
    text: str = Field(max_length=500)
    in_safe_zone: bool = True


class SceneCut(ApiModel):
    t_start_ms: int = Field(ge=0, le=3_600_000)
    t_end_ms: int = Field(ge=0, le=3_600_000)
    kind: SceneKind


class BeatHit(ResponseModel):
    beat: BeatId
    required: bool
    found: bool
    t_ms: int | None = None


class ScoreItem(ResponseModel):
    """One checklist line with its reason (contract ``ScoreItem``) plus the timecode it refers to."""

    id: str
    label: str
    points: int
    max: int
    passed: bool
    reason: str
    fix: str | None = None
    t_ms: int | None = Field(
        default=None, description="Where in the video this item was measured (ms), when it has a position."
    )
    target_ms: int | None = Field(default=None, description="The time the checklist wants it by (ms), when it has one.")


class ScoreCard(ResponseModel):
    """A checklist score (contract ``ScoreCard``). Always labelled as a checklist score until a learned model ships."""

    band: ScoreBand
    points: int
    items: list[ScoreItem]
    label: str


class KnownHash(ApiModel):
    """A perceptual hash of an earlier video, for duplicate detection."""

    id: str = Field(description="The submission or post the hash belongs to.")
    phash: str = Field(pattern=r"^[0-9a-fA-F]{16}$", description="16 hex characters (64-bit pHash).")
    creator_id: str | None = None
    kind: Literal["other_creator", "own_earlier"] = "other_creator"
