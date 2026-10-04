"""Pure checklist scoring: a line-for-line port of ``scoreHook`` / ``scoreFlow`` in ``packages/contract/schema/formulas.mjs``.

This module is the parity-critical core. It takes plain observation dataclasses and returns plain items. Reasons and
fixes here are the contract's fixed strings; ``hook.py`` / ``flow.py`` add the personalised, timecoded explanations on
top without touching a single point. The golden vectors in ``packages/contract/testvectors/ml`` pin this behaviour
for the TypeScript and Swift engines.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from ..constants import CHECKLIST_LABEL, FLOW_CHECKLIST, HOOK_CHECKLIST, ChecklistItem
from ..numeric import js_round, sec, to_fixed
from .bands import band_for


@dataclass(frozen=True, slots=True)
class HookObs:
    """Observations of the first seconds (ms from the first frame; ``None`` = never)."""

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


@dataclass(frozen=True, slots=True)
class FlowObs:
    hook_points: int
    beats_found: int
    beats_required: int
    app_ms: int | None
    disclosure_audio: bool
    disclosure_onscreen: bool
    duration_s: float
    captions_in_safe_zone: bool
    single_cta: bool
    ends_on_win_state: bool
    audio_gaps: int
    format_order: str  # 'in_order' | 'one_off' | 'out_of_order'


@dataclass(frozen=True, slots=True)
class RawItem:
    id: str
    label: str
    points: int
    max: int
    passed: bool
    reason: str
    fix: str | None = None

    def as_dict(self) -> dict[str, object]:
        out: dict[str, object] = {
            "id": self.id,
            "label": self.label,
            "points": self.points,
            "max": self.max,
            "passed": self.passed,
            "reason": self.reason,
        }
        if self.fix is not None:
            out["fix"] = self.fix
        return out


@dataclass(frozen=True, slots=True)
class RawCard:
    band: str
    points: int
    items: tuple[RawItem, ...] = field(default_factory=tuple)
    label: str = CHECKLIST_LABEL

    def as_dict(self) -> dict[str, object]:
        return {
            "band": self.band,
            "points": self.points,
            "items": [i.as_dict() for i in self.items],
            "label": self.label,
        }


_HOOK_DEF: Final[dict[str, ChecklistItem]] = {i["id"]: i for i in HOOK_CHECKLIST}
_FLOW_DEF: Final[dict[str, ChecklistItem]] = {i["id"]: i for i in FLOW_CHECKLIST}


def grade(full: bool, half: bool, max_points: int) -> int:
    """``grade`` from formulas.mjs: full, half (``Math.round(max / 2)``) or zero."""
    return max_points if full else js_round(max_points / 2) if half else 0


def _item(defs: dict[str, ChecklistItem], item_id: str, points: int, reason: str, fix: str) -> RawItem:
    d = defs[item_id]
    return RawItem(
        id=item_id,
        label=d["label"],
        points=points,
        max=d["weight"],
        passed=points == d["weight"],
        reason=reason,
        fix=fix if points < d["weight"] else None,
    )


def score_hook_raw(obs: HookObs) -> RawCard:
    """Hook Score (first 3 seconds), 0..100, checklist weights 20/15/15/15/10/10/10/5."""
    d = _HOOK_DEF
    lands = obs.lands_ms
    on = obs.onscreen_ms
    face = obs.face_ms
    face_pts = 15 if obs.faceless else grade(face is not None and face <= 1000, face is not None and face <= 2000, 15)
    if obs.faceless:
        face_reason = "Faceless format: no face needed."
    elif face is None:
        face_reason = "No face on screen."
    elif face <= 1000:
        face_reason = f"Face on screen at {sec(face)}."
    else:
        face_reason = f"No face until {sec(face)}."
    items = (
        _item(
            d,
            "hook_lands_2s",
            grade(lands is not None and lands <= 2000, lands is not None and lands <= 3000, 20),
            "The hook never lands." if lands is None else f"Hook lands at {sec(lands)}.",
            "Open on the hook line; trim the intro.",
        ),
        _item(
            d,
            "onscreen_text_matches",
            grade(on is not None and on <= 1000 and obs.spoken_matches_onscreen, on is not None and on <= 2000, 15),
            "No on-screen hook text."
            if on is None
            else f"Hook text appears at {sec(on)}{'' if obs.spoken_matches_onscreen else ' and differs from what you say'}.",
            "Burn the spoken hook in as text in the first second.",
        ),
        _item(d, "face_early", face_pts, face_reason, "Start on your face, then cut to the app."),
        _item(
            d,
            "app_visible_3s",
            grade(obs.app_ms is not None and obs.app_ms <= 3000, obs.app_ms is not None and obs.app_ms <= 5000, 15),
            "The app never appears." if obs.app_ms is None else f"App visible at {sec(obs.app_ms)}.",
            "Move the app reveal into the first 3 seconds.",
        ),
        _item(
            d,
            "pattern_interrupt",
            10 if obs.interrupt_ms is not None and obs.interrupt_ms <= 1500 else 0,
            "No cut or motion in the first 1.5s."
            if obs.interrupt_ms is None
            else f"Pattern interrupt at {sec(obs.interrupt_ms)}.",
            "Add a cut or a zoom in the first 1.5 seconds.",
        ),
        _item(
            d,
            "proven_hook_type",
            grade(obs.hook_type_known and obs.hook_type_above_median, obs.hook_type_known, 10),
            "Library hook type." if obs.hook_type_known else "Not a library hook type.",
            "Try a confession, curiosity-gap or specific-number opening.",
        ),
        _item(
            d,
            "speech_starts_fast",
            grade(
                obs.speech_ms is not None and obs.speech_ms <= 1000,
                obs.speech_ms is not None and obs.speech_ms <= 2000,
                10,
            ),
            "No speech found." if obs.speech_ms is None else f"Speech starts at {sec(obs.speech_ms)}.",
            "Cut the dead air before your first word.",
        ),
        _item(
            d,
            "captions_safe_zone",
            5 if obs.captions_in_safe_zone else 0,
            "Captions inside the safe zones." if obs.captions_in_safe_zone else "Captions outside the safe zones.",
            "Move captions above the platform UI.",
        ),
    )
    points = sum(i.points for i in items)
    return RawCard(band=band_for(points), points=points, items=items)


def score_flow_raw(obs: FlowObs) -> RawCard:
    """Flow Score (overall predicted performance band), 0..100, weights 30/25/10/10/5/5/5/5/5."""
    d = _FLOW_DEF
    beats = js_round((25 * obs.beats_found) / obs.beats_required) if obs.beats_required > 0 else 25
    disc = (5 if obs.disclosure_audio else 0) + (5 if obs.disclosure_onscreen else 0)
    dur = obs.duration_s
    if disc == 10:
        disc_reason = "#ad spoken and on screen."
    elif disc == 5:
        disc_reason = "#ad is only " + ("spoken" if obs.disclosure_audio else "on screen") + "."
    else:
        disc_reason = "No #ad."
    if obs.single_cta:
        cta_reason = "One CTA, ends on a win." if obs.ends_on_win_state else "One CTA but no win state at the end."
    else:
        cta_reason = "More than one CTA."
    items = (
        _item(
            d,
            "hook_score",
            js_round(obs.hook_points * 0.3),
            f"Hook Score {obs.hook_points} scaled to 30.",
            "Fix the Hook Score items first.",
        ),
        _item(
            d,
            "required_beats",
            beats,
            f"{obs.beats_found} of {obs.beats_required} required beats found.",
            "Add the missing beat from the shot checklist.",
        ),
        _item(
            d,
            "app_visible_early",
            grade(obs.app_ms is not None and obs.app_ms <= 3000, obs.app_ms is not None and obs.app_ms <= 8000, 10),
            "The app never appears." if obs.app_ms is None else f"App on screen at {sec(obs.app_ms)}.",
            "Show the app by 3 seconds.",
        ),
        _item(d, "disclosure", disc, disc_reason, "Say and show #ad."),
        _item(
            d,
            "length_ok",
            grade(15 <= dur <= 30, (10 <= dur < 15) or (30 < dur <= 45), 5),
            f"Length {to_fixed(dur, 0)}s.",
            "Aim for 15 to 30 seconds.",
        ),
        _item(
            d,
            "captions_safe_zone",
            5 if obs.captions_in_safe_zone else 0,
            "Captions inside the safe zones." if obs.captions_in_safe_zone else "Captions outside the safe zones.",
            "Move captions above the platform UI.",
        ),
        _item(
            d,
            "single_cta_win_state",
            grade(obs.single_cta and obs.ends_on_win_state, obs.single_cta or obs.ends_on_win_state, 5),
            cta_reason,
            "End on the win, then one CTA.",
        ),
        _item(
            d,
            "audio_clear",
            grade(obs.audio_gaps == 0, obs.audio_gaps == 1, 5),
            "Clear audio." if obs.audio_gaps == 0 else f"{obs.audio_gaps} dead-air gap(s) over 1s.",
            "Cut the silences.",
        ),
        _item(
            d,
            "format_fit",
            grade(obs.format_order == "in_order", obs.format_order == "one_off", 5),
            "Follows the format." if obs.format_order == "in_order" else "Beats are out of order for the format.",
            "Re-order to the format's beats.",
        ),
    )
    points = sum(i.points for i in items)
    return RawCard(band=band_for(points), points=points, items=items)
