"""Hook Score: the first-3-seconds checklist score with timecoded reasons and one-tap fixes."""

from __future__ import annotations

from collections.abc import Mapping

from ..constants import (
    BAND_VIEW_MULTIPLIER,
    CHECKLIST_LABEL,
    FUNNEL_VIEW_TO_VISIT,
    FUNNEL_VISIT_TO_INSTALL,
)
from ..numeric import round2, sec
from ..schemas.common import ModelInfo
from ..schemas.scores import HookFeatures, HookScoreRequest, HookScoreResponse, NextBand, ViewsEstimate
from ..version import MODEL_VERSIONS
from .bands import next_band, predicted_views
from .core import HookObs, RawCard, score_hook_raw
from .explain import Effort, best_band, build_fixes, build_reasons, summary_line, to_score_items
from .hook_types import above_median_types, resolve_hook_type

MODEL = ModelInfo(name="hook-score", kind="creative_scorer", version=MODEL_VERSIONS["hook_score"], stage="heuristic")

_EFFORT: dict[str, Effort] = {
    "hook_lands_2s": "moderate",
    "onscreen_text_matches": "quick",
    "face_early": "reshoot",
    "app_visible_3s": "moderate",
    "pattern_interrupt": "quick",
    "proven_hook_type": "reshoot",
    "speech_starts_fast": "quick",
    "captions_safe_zone": "quick",
}


def to_obs(features: HookFeatures, stats: Mapping[str, float] | None = None) -> tuple[HookObs, str]:
    """Resolve the optional hook-type fields into the contract's ``obs`` and say where the answer came from."""
    known, above, source = resolve_hook_type(
        features.hook_type, features.hook_type_known, features.hook_type_above_median, stats
    )
    obs = HookObs(
        lands_ms=features.lands_ms,
        onscreen_ms=features.onscreen_ms,
        spoken_matches_onscreen=features.spoken_matches_onscreen,
        face_ms=features.face_ms,
        faceless=features.faceless,
        app_ms=features.app_ms,
        interrupt_ms=features.interrupt_ms,
        hook_type_known=known,
        hook_type_above_median=above,
        speech_ms=features.speech_ms,
        captions_in_safe_zone=features.captions_in_safe_zone,
    )
    return obs, source


def _fix_texts(obs: HookObs, stats: Mapping[str, float] | None) -> dict[str, str]:
    """Personalised one-tap fixes: the same advice as the checklist, with this video's own numbers."""
    t: dict[str, str] = {}
    if obs.lands_ms is None:
        t["hook_lands_2s"] = "Say the hook line in the first 2 seconds; this video never lands one."
    else:
        over = obs.lands_ms - 2000
        t["hook_lands_2s"] = f"Cut {sec(over)} of intro so the hook lands by 2.0s (it lands at {sec(obs.lands_ms)})."
    if obs.onscreen_ms is None:
        t["onscreen_text_matches"] = "Burn the spoken hook in as text in the first second."
    elif not obs.spoken_matches_onscreen:
        t["onscreen_text_matches"] = "Make the on-screen text say what you say, and show it in the first second."
    else:
        t["onscreen_text_matches"] = f"Show the hook text by 1.0s (it appears at {sec(obs.onscreen_ms)})."
    if obs.face_ms is None:
        t["face_early"] = "Start on your face in the first second, then cut to the app."
    else:
        t["face_early"] = (
            f"Move the face shot to the first second (it appears at {sec(obs.face_ms)}), then cut to the app."
        )
    if obs.app_ms is None:
        t["app_visible_3s"] = "Show the app in the first 3 seconds; it never appears in this cut."
    else:
        t["app_visible_3s"] = (
            f"Cut to the app by 3.0s (it first appears at {sec(obs.app_ms)}), then come back to your face."
        )
    t["pattern_interrupt"] = (
        "Add a cut, zoom or movement before 1.5s."
        if obs.interrupt_ms is None
        else f"Bring the first cut forward to 1.5s (it happens at {sec(obs.interrupt_ms)})."
    )
    if not obs.hook_type_known:
        t["proven_hook_type"] = "Rewrite the opener as a confession, risk-reversal or specific-number line."
    else:
        best = sorted(above_median_types(stats))
        hint = ", ".join(x.replace("_", " ") for x in best[:3]) if best else "a confession"
        t["proven_hook_type"] = f"Try {hint}: those hook types have the higher trial rate."
    t["speech_starts_fast"] = (
        "Start talking in the first second."
        if obs.speech_ms is None
        else f"Cut the dead air: your first word lands at {sec(obs.speech_ms)}, aim for under 1.0s."
    )
    t["captions_safe_zone"] = (
        "Burn captions in and keep them above the bottom platform bar and clear of the side buttons."
    )
    return t


_T_KEY = {
    "hook_lands_2s": "lands_ms",
    "onscreen_text_matches": "onscreen_ms",
    "face_early": "face_ms",
    "app_visible_3s": "app_ms",
    "pattern_interrupt": "interrupt_ms",
    "speech_starts_fast": "speech_ms",
}
_TARGET_MS = {
    "hook_lands_2s": 2000,
    "onscreen_text_matches": 1000,
    "face_early": 1000,
    "app_visible_3s": 3000,
    "pattern_interrupt": 1500,
    "speech_starts_fast": 1000,
}


def views_estimate(median_views: int | None, band: str) -> ViewsEstimate | None:
    if median_views is None:
        return None
    installs_per_1k = round2(1000 * FUNNEL_VIEW_TO_VISIT * FUNNEL_VISIT_TO_INSTALL)
    return ViewsEstimate(
        band_multiplier=BAND_VIEW_MULTIPLIER[band],
        creator_median_views=median_views,
        predicted_views=predicted_views(median_views, band),
        installs_per_1000_views=installs_per_1k,
        note=f"Estimate: your median {median_views:,} views x {BAND_VIEW_MULTIPLIER[band]} for band {band}. Bands move views, not guarantees.",
    )


def explain_card(
    card: RawCard, obs: HookObs, features: HookFeatures, stats: Mapping[str, float] | None
) -> HookScoreResponse:
    t_ms = {item_id: getattr(obs, attr) for item_id, attr in _T_KEY.items()}
    reasons = build_reasons(card.items, t_ms)
    fixes = build_fixes(card.items, card.points, _fix_texts(obs, stats), _EFFORT, t_ms)
    nb = next_band(card.points)
    return HookScoreResponse(
        model=MODEL,
        band=card.band,
        points=card.points,
        items=to_score_items(card.items, t_ms, _TARGET_MS),
        label=CHECKLIST_LABEL,
        summary=summary_line("Hook Score", card.band, card.points, fixes),
        reasons=reasons,
        fixes=fixes,
        next_band=NextBand(band=nb[0], points_needed=nb[1]) if nb else None,
        best_band_if_all_fixed=best_band(card.points, fixes),  # type: ignore[arg-type]
        resolved_features=features.model_copy(
            update={"hook_type_known": obs.hook_type_known, "hook_type_above_median": obs.hook_type_above_median}
        ),
    )


def score_hook(req: HookScoreRequest) -> HookScoreResponse:
    """Score the first 3 seconds of a video from its observed features."""
    stats = {k: float(v) for k, v in req.hook_type_stats.items()} if req.hook_type_stats else None
    features = HookFeatures.model_validate(req.model_dump(include=set(HookFeatures.model_fields)))
    obs, _source = to_obs(features, stats)
    card = score_hook_raw(obs)
    response = explain_card(card, obs, features, stats)
    response.predicted = views_estimate(req.creator_median_views, card.band)
    return response


def hook_points_of(features: HookFeatures, stats: Mapping[str, float] | None = None) -> RawCard:
    """The raw Hook Score card for features (used by the Flow Score and the video pipeline)."""
    obs, _ = to_obs(features, stats)
    return score_hook_raw(obs)


__all__ = ["MODEL", "explain_card", "hook_points_of", "score_hook", "to_obs", "views_estimate"]
