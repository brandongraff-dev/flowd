"""The settled-post export: the table the learned scorer trains on (``settled_posts.jsonl`` / ``.csv``).

One row per post whose 72-hour window has closed and cleared the fraud check. The backend writes it nightly from
``posts`` + ``video_analyses`` (the observations behind the checklist scores at submission time) + the verified outcomes.
Everything the model learns from is something the creator could see and change before posting; nothing about the person.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ..schemas.common import ApiModel, Category, FormatId, HookType, ScoreBand
from ..schemas.scores import FormatOrder


class SettledPostRow(ApiModel):
    post_id: str
    app_id: str = Field(description="Scores are normalised per app, and models are validated on held-out apps.")
    category: Category | None = None
    creator_id: str | None = None
    format_id: FormatId | None = None
    hook_type: HookType | None = None

    # Hook Score observations (ms from the first frame; null = never)
    lands_ms: int | None = None
    onscreen_ms: int | None = None
    spoken_matches_onscreen: bool = False
    face_ms: int | None = None
    faceless: bool = False
    app_ms: int | None = None
    interrupt_ms: int | None = None
    hook_type_known: bool = False
    hook_type_above_median: bool = False
    speech_ms: int | None = None
    captions_in_safe_zone: bool = False

    # Flow Score observations
    beats_found: int = 0
    beats_required: int = 0
    disclosure_audio: bool = False
    disclosure_onscreen: bool = False
    duration_s: float = Field(default=0.0, ge=0)
    single_cta: bool = False
    ends_on_win_state: bool = False
    audio_gaps: int = Field(default=0, ge=0)
    format_order: FormatOrder = "in_order"

    # what the checklist said at submission
    hook_points: int = Field(ge=0, le=100)
    flow_points: int = Field(ge=0, le=100)
    flow_band: ScoreBand

    # creator context the views baseline needs
    creator_median_views_28d: int | None = Field(default=None, ge=0)
    followers: int | None = Field(default=None, ge=0)
    posted_at: str | None = None

    # verified outcomes at the close of the 72-hour window
    window_views: int = Field(ge=0)
    installs: int = Field(default=0, ge=0)
    trials: int = Field(default=0, ge=0)
    paid: int = Field(default=0, ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    fraud_score: int = Field(default=0, ge=0, le=100)
    clawed_back: bool = False


Outcome = Literal["views_lift", "installs_per_1k"]

# Feature columns of the learned scorer, in order. ``*_ms`` features use a 10 s sentinel for "never" so that
# "later is worse" stays monotone.
MS_FEATURES = ("lands_ms", "onscreen_ms", "face_ms", "app_ms", "interrupt_ms", "speech_ms")
BOOL_FEATURES = (
    "spoken_matches_onscreen",
    "faceless",
    "hook_type_known",
    "hook_type_above_median",
    "captions_in_safe_zone",
    "disclosure_audio",
    "disclosure_onscreen",
    "single_cta",
    "ends_on_win_state",
)
NUM_FEATURES = ("beats_found", "beats_required", "duration_s", "audio_gaps")
NEVER_MS = 10_000
FEATURE_NAMES: tuple[str, ...] = (
    *MS_FEATURES,
    *BOOL_FEATURES,
    *NUM_FEATURES,
    "beat_coverage",
    "format_order",
    "log_creator_median_views",
)

# +1: more is better, -1: less is better, 0: unconstrained (effect not known a priori)
MONOTONE: dict[str, int] = {
    "lands_ms": -1,
    "onscreen_ms": -1,
    "face_ms": 0,
    "app_ms": -1,
    "interrupt_ms": 0,
    "speech_ms": -1,
    "spoken_matches_onscreen": 1,
    "faceless": 0,
    "hook_type_known": 1,
    "hook_type_above_median": 1,
    "captions_in_safe_zone": 1,
    "disclosure_audio": 0,
    "disclosure_onscreen": 0,
    "single_cta": 1,
    "ends_on_win_state": 1,
    "beats_found": 0,
    "beats_required": 0,
    "duration_s": 0,
    "audio_gaps": -1,
    "beat_coverage": 1,
    "format_order": -1,
    "log_creator_median_views": 0,
}

FEATURE_LABELS: dict[str, str] = {
    "lands_ms": "when the hook lands",
    "onscreen_ms": "when hook text appears",
    "face_ms": "when a face first appears",
    "app_ms": "when the app first appears",
    "interrupt_ms": "the first cut or motion",
    "speech_ms": "when speech starts",
    "spoken_matches_onscreen": "on-screen text mirroring the spoken hook",
    "faceless": "being a faceless format",
    "hook_type_known": "using a library hook type",
    "hook_type_above_median": "using a high-trial-rate hook type",
    "captions_in_safe_zone": "captions inside the safe zones",
    "disclosure_audio": "a spoken disclosure",
    "disclosure_onscreen": "an on-screen disclosure",
    "single_cta": "a single call to action",
    "ends_on_win_state": "ending on a win",
    "beats_found": "required beats found",
    "beats_required": "required beats in the brief",
    "duration_s": "video length",
    "audio_gaps": "dead-air gaps",
    "beat_coverage": "share of required beats covered",
    "format_order": "following the format's beat order",
    "log_creator_median_views": "the creator's usual audience",
}
