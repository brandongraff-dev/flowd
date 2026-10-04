"""Shadow mode: run a loaded learned scorer beside the checklist for a flow-score request, never instead of it."""

from __future__ import annotations

import math

from ..schemas.scores import FlowScoreRequest, ShadowPrediction
from ..scoring.core import RawCard
from ..scoring.flow import to_obs as flow_to_obs
from ..scoring.hook import hook_points_of
from ..scoring.hook import to_obs as hook_to_obs
from .schema import SettledPostRow
from .trainer import LearnedScorer


def shadow_row(req: FlowScoreRequest) -> SettledPostRow | None:
    """A feature row for the request (outcomes are placeholders). ``None`` unless hook features were given."""
    if req.hook is None:
        return None
    hook_card: RawCard = hook_points_of(req.hook)
    hobs, _ = hook_to_obs(req.hook)
    fobs = flow_to_obs(req, hook_card.points)
    return SettledPostRow(
        post_id="shadow",
        app_id="shadow",
        format_id=req.format_id,
        hook_type=req.hook.hook_type,
        lands_ms=hobs.lands_ms,
        onscreen_ms=hobs.onscreen_ms,
        spoken_matches_onscreen=hobs.spoken_matches_onscreen,
        face_ms=hobs.face_ms,
        faceless=hobs.faceless,
        app_ms=hobs.app_ms,
        interrupt_ms=hobs.interrupt_ms,
        hook_type_known=hobs.hook_type_known,
        hook_type_above_median=hobs.hook_type_above_median,
        speech_ms=hobs.speech_ms,
        captions_in_safe_zone=hobs.captions_in_safe_zone,
        beats_found=fobs.beats_found,
        beats_required=fobs.beats_required,
        disclosure_audio=fobs.disclosure_audio,
        disclosure_onscreen=fobs.disclosure_onscreen,
        duration_s=fobs.duration_s,
        single_cta=fobs.single_cta,
        ends_on_win_state=fobs.ends_on_win_state,
        audio_gaps=fobs.audio_gaps,
        format_order=fobs.format_order,  # type: ignore[arg-type]
        hook_points=hook_card.points,
        flow_points=0,
        flow_band="E",
        creator_median_views_28d=req.creator_median_views,
        window_views=0,
    )


def shadow_prediction(scorer: LearnedScorer, req: FlowScoreRequest) -> ShadowPrediction | None:
    row = shadow_row(req)
    if row is None:
        return None
    y = scorer.predict(row)
    return ShadowPrediction(
        model_version=scorer.version,
        band=scorer.cutoffs.band(y),  # type: ignore[arg-type]
        predicted_lift_multiple=round(math.exp(y), 2),
        reasons=scorer.explain(row),
    )
