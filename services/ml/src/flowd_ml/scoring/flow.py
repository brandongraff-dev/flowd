"""Flow Score: the overall predicted-performance checklist band with reasons and one-tap fixes."""

from __future__ import annotations

from ..constants import CHECKLIST_LABEL, FORMAT_BEATS
from ..numeric import sec, to_fixed
from ..schemas.common import ModelInfo, ScoreCard
from ..schemas.scores import FlowFeatures, FlowScoreRequest, FlowScoreResponse, HookScoreResponse, NextBand
from ..version import MODEL_VERSIONS
from .bands import band_for, next_band
from .core import FlowObs, RawCard, score_flow_raw
from .explain import Effort, best_band, build_fixes, build_reasons, summary_line, to_score_items
from .hook import explain_card as explain_hook_card
from .hook import hook_points_of, views_estimate
from .hook import to_obs as hook_to_obs

MODEL = ModelInfo(name="flow-score", kind="creative_scorer", version=MODEL_VERSIONS["flow_score"], stage="heuristic")

_EFFORT: dict[str, Effort] = {
    "hook_score": "moderate",
    "required_beats": "reshoot",
    "app_visible_early": "moderate",
    "disclosure": "quick",
    "length_ok": "quick",
    "captions_safe_zone": "quick",
    "single_cta_win_state": "moderate",
    "audio_clear": "quick",
    "format_fit": "moderate",
}
_T_KEY = {"app_visible_early": "app_ms"}
_TARGET_MS = {"app_visible_early": 3000}


def to_obs(features: FlowFeatures, hook_points: int) -> FlowObs:
    """Resolve the optional inputs (beats list, hook features) into the contract's ``obs``."""
    if features.beats is not None:
        required = [b for b in features.beats if b.required]
        found, total = sum(1 for b in required if b.found), len(required)
    else:
        found, total = int(features.beats_found or 0), int(features.beats_required or 0)
    return FlowObs(
        hook_points=hook_points,
        beats_found=found,
        beats_required=total,
        app_ms=features.app_ms,
        disclosure_audio=features.disclosure_audio,
        disclosure_onscreen=features.disclosure_onscreen,
        duration_s=features.duration_s,
        captions_in_safe_zone=features.captions_in_safe_zone,
        single_cta=features.single_cta,
        ends_on_win_state=features.ends_on_win_state,
        audio_gaps=features.audio_gaps,
        format_order=features.format_order,
    )


def _fix_texts(obs: FlowObs, features: FlowFeatures, hook_card: RawCard) -> dict[str, str]:
    t: dict[str, str] = {}
    lost_hook = 100 - hook_card.points
    t["hook_score"] = (
        f"Fix the Hook Score first: it is {hook_card.points}/100 and every Hook point is worth 0.3 here (up to {round(lost_hook * 0.3)} more)."
    )
    missing = [b.beat.replace("_", " ") for b in (features.beats or []) if b.required and not b.found]
    if missing:
        t["required_beats"] = f"Add the missing beat{'s' if len(missing) > 1 else ''}: {', '.join(missing)}."
    else:
        t["required_beats"] = f"Add the {obs.beats_required - obs.beats_found} missing beat(s) from the shot checklist."
    t["app_visible_early"] = (
        "Show the app in the first 3 seconds; it never appears."
        if obs.app_ms is None
        else f"Show the app by 3.0s (it appears at {sec(obs.app_ms)})."
    )
    if not obs.disclosure_audio and not obs.disclosure_onscreen:
        t["disclosure"] = 'Say "this is a paid partnership" and keep #ad on screen for 2 seconds.'
    elif not obs.disclosure_audio:
        t["disclosure"] = 'Say "this is a paid partnership" out loud; #ad is only on screen.'
    else:
        t["disclosure"] = "Keep #ad on screen for 2 seconds; it is only spoken."
    if obs.duration_s > 30:
        t["length_ok"] = f"Trim to 30 seconds or less (it runs {to_fixed(obs.duration_s, 0)}s)."
    else:
        t["length_ok"] = f"Extend to at least 15 seconds (it runs {to_fixed(obs.duration_s, 0)}s)."
    t["captions_safe_zone"] = "Move captions above the bottom platform bar and away from the side buttons."
    if not obs.single_cta:
        t["single_cta_win_state"] = "Keep exactly one call to action and drop the rest."
    else:
        t["single_cta_win_state"] = "End on the win (the moment the app delivered), then the one CTA."
    if obs.audio_gaps:
        t["audio_clear"] = f"Cut the {obs.audio_gaps} silence(s) longer than 1 second and re-export."
    else:
        t["audio_clear"] = "Cut the silences longer than 1 second and re-export."
    order = " > ".join(FORMAT_BEATS[features.format_id]) if features.format_id else "the format's beat order"
    t["format_fit"] = f"Re-order the beats to {order.replace('_', ' ')}."
    return t


def explain_card(card: RawCard, obs: FlowObs, features: FlowFeatures, hook_card: RawCard) -> FlowScoreResponse:
    t_ms = {item_id: getattr(obs, attr) for item_id, attr in _T_KEY.items()}
    reasons = build_reasons(card.items, t_ms)
    fixes = build_fixes(card.items, card.points, _fix_texts(obs, features, hook_card), _EFFORT, t_ms)
    nb = next_band(card.points)
    resolved: dict[str, float | int | bool | str | None] = {
        "hook_points": obs.hook_points,
        "beats_found": obs.beats_found,
        "beats_required": obs.beats_required,
        "app_ms": obs.app_ms,
        "disclosure_audio": obs.disclosure_audio,
        "disclosure_onscreen": obs.disclosure_onscreen,
        "duration_s": obs.duration_s,
        "captions_in_safe_zone": obs.captions_in_safe_zone,
        "single_cta": obs.single_cta,
        "ends_on_win_state": obs.ends_on_win_state,
        "audio_gaps": obs.audio_gaps,
        "format_order": obs.format_order,
        "format_id": features.format_id,
    }
    return FlowScoreResponse(
        model=MODEL,
        band=card.band,
        points=card.points,
        items=to_score_items(card.items, t_ms, _TARGET_MS),
        label=CHECKLIST_LABEL,
        summary=summary_line("Flow Score", card.band, card.points, fixes),
        reasons=reasons,
        fixes=fixes,
        next_band=NextBand(band=nb[0], points_needed=nb[1]) if nb else None,
        best_band_if_all_fixed=best_band(card.points, fixes),  # type: ignore[arg-type]
        resolved=resolved,
    )


def score_flow(req: FlowScoreRequest) -> FlowScoreResponse:
    """Score a whole video. Computes the Hook Score itself when given hook features."""
    features = FlowFeatures.model_validate(req.model_dump(include=set(FlowFeatures.model_fields)))
    hook_card: RawCard
    hook_response: HookScoreResponse | None = None
    if features.hook is not None:
        hook_card = hook_points_of(features.hook)
        hook_obs, _ = hook_to_obs(features.hook)
        hook_response = explain_hook_card(hook_card, hook_obs, features.hook, None)
    else:
        hook_card = RawCard(band=band_for(int(features.hook_points or 0)), points=int(features.hook_points or 0))
    obs = to_obs(features, hook_card.points)
    card = score_flow_raw(obs)
    response = explain_card(card, obs, features, hook_card)
    if hook_response is not None:
        response.hook_score = ScoreCard(
            band=hook_response.band, points=hook_response.points, items=hook_response.items, label=hook_response.label
        )
    response.predicted = views_estimate(req.creator_median_views, card.band)
    return response
