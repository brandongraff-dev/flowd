"""Golden test vectors for the ML models, in a neutral JSON format (``packages/contract/testvectors/ml/*.json``).

The TypeScript engine (``apps/web/src/lib/engine``) and the Swift engine (``Core/Engine``) are parity-tested against the same
cases. Every file is::

    { "schema": "flowd.testvectors/1", "suite": "...", "parity": "required" | "reference", "endpoint": "/v1/...",
      "compare": {...}, "cases": [ { "id": "...", "description": "...", "in": {...}, "out": {...} } ] }

``in`` is a valid request body for ``endpoint`` (or the arguments of ``function``); ``out`` is the MINIMUM an implementation must
reproduce: every key present in ``out`` must equal the implementation's value (objects: subset match, arrays: same length and
element-wise subset, numbers: exact, they are already rounded as the contract rounds them). Extra keys in an implementation's output are
fine. ``parity: required`` suites are pure formulas both engines implement; ``reference`` suites pin the Python service's behaviour
(text rules, detector severities, explanations) and are optional for the other engines.

The cases are produced by running the service itself, so ``tests/test_vectors.py`` also fails when the committed files drift from the
code, and ``tests/test_contract_parity.py`` re-checks the ``required`` suites against the contract's JavaScript reference with node.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .calibration.report import build_report
from .constants import CHECKLIST_LABEL
from .fatigue.detect import detect_fatigue
from .fraud.compose import compose, fraud_action
from .fraud.engine import score_fraud
from .matching.rank import match_score, rank_bounties
from .numeric import js_round, mul_rate, round2, to_fixed
from .phash.core import hamming_hex, majority_hash, phash_gray, to_hex
from .pricing.fill import fill_time, price_curve
from .pricing.money import all_in_cpm, expected_earnings, first_bounty_funding, funding
from .pricing.suggest import suggest_cpm
from .qa.beats import BeatContext, detect_beats, infer_format_order, locate_beat
from .qa.engine import run_qa
from .schemas.calibration import CalibrationRequest
from .schemas.common import BeatHit
from .schemas.fatigue import FatigueRequest
from .schemas.fraud import FraudRequest
from .schemas.matching import MatchRequest
from .schemas.pricing import SuggestCpmRequest
from .schemas.qa import BriefBeatIn, QaRequest
from .scoring.bands import band_for, predicted_views
from .scoring.core import FlowObs, HookObs, score_flow_raw, score_hook_raw
from .scoring.hook_types import classify_hook_text
from .version import CONTRACT_VERSION

SCHEMA = "flowd.testvectors/1"
DEFAULT_OUT = Path(__file__).resolve().parents[4] / "packages" / "contract" / "testvectors" / "ml"


def _case(case_id: str, description: str, inp: Any, out: Any) -> dict[str, Any]:
    return {"id": case_id, "description": description, "in": inp, "out": out}


def _suite(
    name: str,
    description: str,
    parity: str,
    cases: list[dict[str, Any]],
    *,
    endpoint: str | None = None,
    function: str | None = None,
    reference: str = "",
) -> dict[str, Any]:
    s: dict[str, Any] = {
        "schema": SCHEMA,
        "suite": name,
        "description": description,
        "contract_version": CONTRACT_VERSION,
        "parity": parity,
        "compare": {
            "objects": "subset",
            "arrays": "same length, element-wise subset",
            "numbers": "exact",
            "null": "must be null",
        },
        "reference": reference,
        "generated_by": "services/ml/scripts/export_vectors.py (do not edit by hand)",
    }
    if endpoint:
        s["endpoint"] = endpoint
    if function:
        s["function"] = function
    s["cases"] = cases
    return s


def _json_safe(x: Any) -> Any:
    return json.loads(json.dumps(x, sort_keys=False))


# ── rounding and bands ──────────────────────────────────────────────────────────────────────────
def rounding() -> dict[str, Any]:
    calls: list[tuple[str, str, list[Any]]] = [
        ("mul_rate half up .5", "mul_rate", [5, 0.10]),
        ("mul_rate 2.5 -> 3", "mul_rate", [25, 0.10]),
        ("mul_rate 1.5 -> 2", "mul_rate", [15, 0.10]),
        ("mul_rate 0.4 -> 0", "mul_rate", [4, 0.10]),
        ("mul_rate typical fee", "mul_rate", [9640, 0.10]),
        ("mul_rate 12 percent", "mul_rate", [500_000, 0.12]),
        ("mul_rate card rate", "mul_rate", [560_000, 0.029]),
        ("mul_rate one cent at 50 percent", "mul_rate", [1, 0.5]),
        ("mul_rate zero", "mul_rate", [0, 0.12]),
        ("mul_rate 6 percent", "mul_rate", [127_200, 0.06]),
        ("js_round 0.5", "js_round", [0.5]),
        ("js_round 1.5", "js_round", [1.5]),
        ("js_round 2.5", "js_round", [2.5]),
        ("js_round 2.4999", "js_round", [2.4999]),
        ("js_round negative half", "js_round", [-0.5]),
        ("js_round negative 1.5", "js_round", [-1.5]),
        ("js_round 7.5", "js_round", [7.5]),
        ("js_round 12.5", "js_round", [12.5]),
        ("round2 .005", "round2", [0.005]),
        ("round2 1.005 (binary 1.00499..)", "round2", [1.005]),
        ("round2 2.675", "round2", [2.675]),
        ("round2 0.125", "round2", [0.125]),
        ("round2 0.335", "round2", [0.335]),
        ("round2 plain", "round2", [0.4949]),
        ("to_fixed 2.25 -> 2.3", "to_fixed", [2.25, 1]),
        ("to_fixed 0.25 -> 0.3", "to_fixed", [0.25, 1]),
        ("to_fixed 24.5 -> 25", "to_fixed", [24.5, 0]),
        ("to_fixed 11.5 -> 12", "to_fixed", [11.5, 0]),
        ("to_fixed 2.4", "to_fixed", [2.4, 1]),
        ("to_fixed 1.005 -> 1.00", "to_fixed", [1.005, 2]),
        ("to_fixed 0", "to_fixed", [0, 1]),
        ("to_fixed 3.6", "to_fixed", [3.6, 1]),
    ]
    fns: dict[str, Callable[..., Any]] = {
        "mul_rate": mul_rate,
        "js_round": js_round,
        "round2": round2,
        "to_fixed": to_fixed,
    }
    cases = [
        _case(f"{i:02d}_{d.replace(' ', '_')}", d, {"fn": fn, "args": a}, fns[fn](*a))
        for i, (d, fn, a) in enumerate(calls, start=1)
    ]
    return _suite(
        "rounding",
        "Rounding as the contract does it: Math.round (half toward +infinity), toFixed (half away from zero on the exact binary value), "
        "basis-point math for rates. Banker's rounding (Python round, Swift .toNearestOrEven) is WRONG here.",
        "required",
        cases,
        function="fn(args...)",
        reference="packages/contract/schema/formulas.mjs: mulRate, round2; Math.round; Number.prototype.toFixed",
    )


def bands() -> dict[str, Any]:
    cases = [
        _case(f"band_{p}", f"{p} points", {"fn": "band_for", "args": [p]}, band_for(p))
        for p in (0, 1, 39, 39.99, 40, 54, 54.99, 55, 69, 69.99, 70, 84, 84.99, 85, 92, 100)
    ]
    for median_views, band in (
        (14_200, "B"),
        (14_200, "A"),
        (14_200, "E"),
        (9_999, "C"),
        (5, "D"),
        (0, "A"),
        (1_000_000, "A"),
        (333, "B"),
    ):
        cases.append(
            _case(
                f"views_{median_views}_{band}",
                f"predicted views for median {median_views}, band {band}",
                {"fn": "predicted_views", "args": [median_views, band]},
                predicted_views(median_views, band),
            )
        )
    return _suite(
        "bands",
        "Band thresholds A 85+, B 70-84, C 55-69, D 40-54, E under 40, and predicted views = round(median x band multiplier) with A 1.6, B 1.15, C 0.85, D 0.5, E 0.3.",
        "required",
        cases,
        function="fn(args...)",
        reference="packages/contract/schema/formulas.mjs: bandFor, predictedViews",
    )


# ── scores ──────────────────────────────────────────────────────────────────────────────────────
_PERFECT_HOOK: dict[str, Any] = {
    "lands_ms": 800,
    "onscreen_ms": 500,
    "spoken_matches_onscreen": True,
    "face_ms": 300,
    "faceless": False,
    "app_ms": 1500,
    "interrupt_ms": 900,
    "hook_type_known": True,
    "hook_type_above_median": True,
    "speech_ms": 300,
    "captions_in_safe_zone": True,
}
_EMPTY_HOOK: dict[str, Any] = {
    "lands_ms": None,
    "onscreen_ms": None,
    "spoken_matches_onscreen": False,
    "face_ms": None,
    "faceless": False,
    "app_ms": None,
    "interrupt_ms": None,
    "hook_type_known": False,
    "hook_type_above_median": False,
    "speech_ms": None,
    "captions_in_safe_zone": False,
}


def _hook(**over: Any) -> dict[str, Any]:
    return {**_PERFECT_HOOK, **over}


def hook_score() -> dict[str, Any]:
    specs: list[tuple[str, str, dict[str, Any]]] = [
        (
            "contract_hook_lands_2_4s",
            "The contract's worked example: hook lands at 2.4 s, everything else on time (90, band A).",
            {
                "lands_ms": 2400,
                "onscreen_ms": 900,
                "spoken_matches_onscreen": True,
                "face_ms": 300,
                "faceless": False,
                "app_ms": 2800,
                "interrupt_ms": 1200,
                "hook_type_known": True,
                "hook_type_above_median": True,
                "speech_ms": 400,
                "captions_in_safe_zone": True,
            },
        ),
        (
            "contract_weak_opener",
            "The contract's weak example (5 points, band E).",
            {
                "lands_ms": 3600,
                "onscreen_ms": None,
                "spoken_matches_onscreen": False,
                "face_ms": 3100,
                "faceless": False,
                "app_ms": 6200,
                "interrupt_ms": None,
                "hook_type_known": False,
                "hook_type_above_median": False,
                "speech_ms": 1700,
                "captions_in_safe_zone": False,
            },
        ),
        ("perfect", "Every item earned: 100 points, band A.", _hook()),
        ("nothing_happens", "Nothing is found: 0 points, band E.", dict(_EMPTY_HOOK)),
        ("lands_2000_full", "Hook lands exactly at 2.0 s: full 20.", _hook(lands_ms=2000)),
        ("lands_2001_half", "2.001 s: half (10).", _hook(lands_ms=2001)),
        ("lands_3000_half", "3.0 s: still half.", _hook(lands_ms=3000)),
        ("lands_3001_zero", "3.001 s: zero.", _hook(lands_ms=3001)),
        ("lands_never", "The hook never lands: zero, reason 'The hook never lands.'", _hook(lands_ms=None)),
        (
            "onscreen_1000_matches_full",
            "Hook text at 1.0 s mirroring the spoken hook: full 15.",
            _hook(onscreen_ms=1000, spoken_matches_onscreen=True),
        ),
        (
            "onscreen_1000_differs_half",
            "Hook text at 1.0 s that differs from what is said: half (8, Math.round(7.5)).",
            _hook(onscreen_ms=1000, spoken_matches_onscreen=False),
        ),
        (
            "onscreen_2000_matches_half",
            "Matching text at 2.0 s: half (8).",
            _hook(onscreen_ms=2000, spoken_matches_onscreen=True),
        ),
        ("onscreen_2001_zero", "Text at 2.001 s: zero.", _hook(onscreen_ms=2001, spoken_matches_onscreen=True)),
        (
            "faceless_no_face_full",
            "Faceless format with no face: full 15, reason 'Faceless format: no face needed.'",
            _hook(faceless=True, face_ms=None),
        ),
        ("face_1000_full", "Face at 1.0 s: full.", _hook(face_ms=1000)),
        ("face_1001_half", "Face at 1.001 s: half (8).", _hook(face_ms=1001)),
        ("face_2000_half", "Face at 2.0 s: half.", _hook(face_ms=2000)),
        ("face_2001_zero", "Face at 2.001 s: zero, 'No face until 2.0s.'", _hook(face_ms=2001)),
        ("face_never", "No face at all.", _hook(face_ms=None)),
        ("app_3000_full", "App at 3.0 s: full.", _hook(app_ms=3000)),
        ("app_3001_half", "App at 3.001 s: half (8).", _hook(app_ms=3001)),
        ("app_5000_half", "App at 5.0 s: half.", _hook(app_ms=5000)),
        ("app_5001_zero", "App at 5.001 s: zero.", _hook(app_ms=5001)),
        ("app_never", "The app never appears.", _hook(app_ms=None)),
        ("interrupt_1500_full", "Pattern interrupt at 1.5 s: full 10.", _hook(interrupt_ms=1500)),
        ("interrupt_1501_zero", "At 1.501 s: zero (no half credit).", _hook(interrupt_ms=1501)),
        (
            "hook_type_known_above",
            "Library hook type with an above-median trial rate: full 10.",
            _hook(hook_type_known=True, hook_type_above_median=True),
        ),
        (
            "hook_type_known_below",
            "Library hook type below the median: half (5).",
            _hook(hook_type_known=True, hook_type_above_median=False),
        ),
        (
            "hook_type_unknown",
            "Not a library hook type: zero.",
            _hook(hook_type_known=False, hook_type_above_median=False),
        ),
        (
            "hook_type_unknown_but_flag",
            "above_median set without known: still zero (known is required).",
            _hook(hook_type_known=False, hook_type_above_median=True),
        ),
        ("speech_1000_full", "Speech at 1.0 s: full 10.", _hook(speech_ms=1000)),
        ("speech_1001_half", "Speech at 1.001 s: half (5).", _hook(speech_ms=1001)),
        ("speech_2000_half", "Speech at 2.0 s: half.", _hook(speech_ms=2000)),
        ("speech_2001_zero", "Speech at 2.001 s: zero.", _hook(speech_ms=2001)),
        ("speech_never", "No speech.", _hook(speech_ms=None)),
        ("captions_outside", "Captions outside the safe zones: zero, band falls.", _hook(captions_in_safe_zone=False)),
        (
            "band_boundary_85",
            "Exactly 85 points is band A (perfect minus 15 from app half + onscreen half).",
            _hook(app_ms=4000, onscreen_ms=1500, spoken_matches_onscreen=True),
        ),
        (
            "band_boundary_70",
            "Around the B/C line.",
            _hook(lands_ms=2500, face_ms=1500, app_ms=4000, interrupt_ms=None),
        ),
    ]
    cases = []
    for cid, desc, inp in specs:
        card = score_hook_raw(HookObs(**inp)).as_dict()
        cases.append(_case(cid, desc, inp, card))
    return _suite(
        "hook_score",
        "Hook Score checklist (first 3 seconds): weights 20/15/15/15/10/10/10/5, full / half / zero per item. Times are milliseconds, null = never.",
        "required",
        cases,
        endpoint="/v1/hook-score",
        function="scoreHook(obs)",
        reference="packages/contract/schema/formulas.mjs: scoreHook",
    )


_PERFECT_FLOW: dict[str, Any] = {
    "hook_points": 100,
    "beats_found": 5,
    "beats_required": 5,
    "app_ms": 1500,
    "disclosure_audio": True,
    "disclosure_onscreen": True,
    "duration_s": 24,
    "captions_in_safe_zone": True,
    "single_cta": True,
    "ends_on_win_state": True,
    "audio_gaps": 0,
    "format_order": "in_order",
}


def _flow(**over: Any) -> dict[str, Any]:
    return {**_PERFECT_FLOW, **over}


def flow_score() -> dict[str, Any]:
    specs: list[tuple[str, str, dict[str, Any]]] = [
        (
            "contract_4_of_5_beats",
            "The contract's worked example: Hook 90, 4 of 5 beats, 24 s (92, band A).",
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
            },
        ),
        (
            "contract_weak_video",
            "The contract's weak example (25, band E).",
            {
                "hook_points": 34,
                "beats_found": 2,
                "beats_required": 5,
                "app_ms": 9000,
                "disclosure_audio": False,
                "disclosure_onscreen": True,
                "duration_s": 52,
                "captions_in_safe_zone": False,
                "single_cta": False,
                "ends_on_win_state": False,
                "audio_gaps": 3,
                "format_order": "out_of_order",
            },
        ),
        ("perfect", "Every item earned: 100, band A.", _flow()),
        (
            "no_beats_required",
            "A brief with no required beats earns the full 25.",
            _flow(beats_found=0, beats_required=0),
        ),
        ("beats_1_of_2_half_up", "1 of 2 beats = 12.5, rounded half up to 13.", _flow(beats_found=1, beats_required=2)),
        ("beats_1_of_3", "1 of 3 = 8.33 -> 8.", _flow(beats_found=1, beats_required=3)),
        ("beats_2_of_3", "2 of 3 = 16.67 -> 17.", _flow(beats_found=2, beats_required=3)),
        ("beats_3_of_8", "3 of 8 = 9.375 -> 9.", _flow(beats_found=3, beats_required=8)),
        ("beats_none_found", "0 of 4.", _flow(beats_found=0, beats_required=4)),
        ("hook_35_rounds_up", "Hook 35 x 0.3 = 10.5 -> 11.", _flow(hook_points=35)),
        ("hook_45_rounds_up", "Hook 45 x 0.3 = 13.5 -> 14.", _flow(hook_points=45)),
        ("hook_0", "Hook 0.", _flow(hook_points=0)),
        ("app_3000_full", "App at 3.0 s: full 10.", _flow(app_ms=3000)),
        ("app_3001_half", "App at 3.001 s: half 5.", _flow(app_ms=3001)),
        ("app_8000_half", "App at 8.0 s: half.", _flow(app_ms=8000)),
        ("app_8001_zero", "App at 8.001 s: zero.", _flow(app_ms=8001)),
        ("app_never", "App never appears.", _flow(app_ms=None)),
        ("disclosure_audio_only", "Only spoken: 5.", _flow(disclosure_onscreen=False)),
        ("disclosure_screen_only", "Only on screen: 5.", _flow(disclosure_audio=False)),
        ("disclosure_none", "Neither: 0, 'No #ad.'", _flow(disclosure_audio=False, disclosure_onscreen=False)),
        ("length_9_9", "9.9 s: zero.", _flow(duration_s=9.9)),
        ("length_10", "10 s: half (3).", _flow(duration_s=10)),
        ("length_14_99", "14.99 s: half.", _flow(duration_s=14.99)),
        ("length_15", "15 s: full.", _flow(duration_s=15)),
        ("length_30", "30 s: full.", _flow(duration_s=30)),
        ("length_30_01", "30.01 s: half.", _flow(duration_s=30.01)),
        ("length_45", "45 s: half.", _flow(duration_s=45)),
        ("length_45_01", "45.01 s: zero.", _flow(duration_s=45.01)),
        ("length_reason_rounds_half_up", "24.5 s prints as 'Length 25s.' (toFixed half up).", _flow(duration_s=24.5)),
        ("length_reason_11_5", "11.5 s prints 'Length 12s.'", _flow(duration_s=11.5)),
        ("captions_outside", "Captions outside the safe zones.", _flow(captions_in_safe_zone=False)),
        ("cta_one_no_win", "One CTA but no win state: half (3).", _flow(ends_on_win_state=False)),
        (
            "cta_many_win",
            "Win state but more than one CTA: half (3), reason 'More than one CTA.'",
            _flow(single_cta=False),
        ),
        ("cta_many_no_win", "Neither: zero.", _flow(single_cta=False, ends_on_win_state=False)),
        ("audio_1_gap", "One dead-air gap: half (3).", _flow(audio_gaps=1)),
        ("audio_2_gaps", "Two gaps: zero.", _flow(audio_gaps=2)),
        ("format_one_off", "One beat out of order: half (3).", _flow(format_order="one_off")),
        ("format_out_of_order", "Out of order: zero.", _flow(format_order="out_of_order")),
        (
            "nothing",
            "Everything missing.",
            {
                "hook_points": 0,
                "beats_found": 0,
                "beats_required": 5,
                "app_ms": None,
                "disclosure_audio": False,
                "disclosure_onscreen": False,
                "duration_s": 0,
                "captions_in_safe_zone": False,
                "single_cta": False,
                "ends_on_win_state": False,
                "audio_gaps": 4,
                "format_order": "out_of_order",
            },
        ),
    ]
    cases = []
    for cid, desc, inp in specs:
        cases.append(_case(cid, desc, inp, score_flow_raw(FlowObs(**inp)).as_dict()))
    return _suite(
        "flow_score",
        "Flow Score checklist (whole video): weights 30/25/10/10/5/5/5/5/5. The hook item is round(Hook Score x 0.30); beats are round(25 x found / required).",
        "required",
        cases,
        endpoint="/v1/flow-score",
        function="scoreFlow(obs)",
        reference="packages/contract/schema/formulas.mjs: scoreFlow",
    )


# ── fraud ───────────────────────────────────────────────────────────────────────────────────────
def fraud_compose() -> dict[str, Any]:
    def sig(name: str, sev: float) -> dict[str, Any]:
        return {"signal": name, "severity": sev}

    specs: list[tuple[str, str, list[dict[str, Any]]]] = [
        (
            "contract_spiky_post",
            "The contract's example: spiky post, no engagement, 62% other traffic (60, review).",
            [
                sig("view_spike_no_engagement", 0.8),
                sig("bought_views_pattern", 0.9),
                sig("traffic_source_anomaly", 0.7),
                sig("curve_shape", 0.6),
            ],
        ),
        (
            "contract_new_account",
            "New account with weak engagement (15, clean).",
            [sig("new_account", 1), sig("engagement_anomaly", 0.5)],
        ),
        ("contract_no_signals", "No signals fired (0, clean).", []),
        (
            "capped_at_100",
            "All ten signals at severity 1 sum to 160 and cap at 100.",
            [
                sig(n, 1)
                for n in (
                    "view_spike_no_engagement",
                    "cap_clustering",
                    "bought_views_pattern",
                    "geo_mismatch",
                    "view_to_follower_outlier",
                    "new_account",
                    "duplicate_hash",
                    "engagement_anomaly",
                    "traffic_source_anomaly",
                    "curve_shape",
                )
            ],
        ),
        ("score_19_clean", "round(25 x 0.76) = 19: top of clean.", [sig("view_spike_no_engagement", 0.76)]),
        ("score_20_watch", "round(25 x 0.8) = 20: bottom of watch.", [sig("view_spike_no_engagement", 0.8)]),
        (
            "score_39_watch",
            "25 + round(15 x 0.93) = 39: top of watch.",
            [sig("view_spike_no_engagement", 1), sig("geo_mismatch", 0.93)],
        ),
        (
            "score_40_review",
            "25 + 15 = 40: bottom of review (human review within 24 h).",
            [sig("view_spike_no_engagement", 1), sig("geo_mismatch", 1)],
        ),
        (
            "score_69_review",
            "30 + 25 + 10 + 4 = 69: top of review.",
            [
                sig("bought_views_pattern", 1),
                sig("view_spike_no_engagement", 1),
                sig("new_account", 1),
                sig("engagement_anomaly", 0.4),
            ],
        ),
        (
            "score_70_high",
            "70: auto-hold and queue for Ops.",
            [
                sig("bought_views_pattern", 1),
                sig("view_spike_no_engagement", 1),
                sig("new_account", 1),
                sig("engagement_anomaly", 0.5),
            ],
        ),
        (
            "half_point_rounds_up",
            "round(10 x 0.05) = round(0.5) = 1 (half up), so the signal is kept.",
            [sig("engagement_anomaly", 0.05)],
        ),
        (
            "sub_half_point_dropped",
            "round(10 x 0.04) = round(0.4) = 0, so the signal is dropped from the evidence.",
            [sig("engagement_anomaly", 0.04)],
        ),
        (
            "zero_severity_dropped",
            "Severity 0 contributes nothing.",
            [sig("duplicate_hash", 0), sig("new_account", 0.3)],
        ),
        (
            "custom_detail_kept",
            "A supplied detail string is carried through.",
            [{"signal": "duplicate_hash", "severity": 0.8, "detail": "Matches sub_0311 at distance 2."}],
        ),
    ]
    cases = []
    for cid, desc, signals in specs:
        score, band, hits = compose(signals)
        cases.append(
            _case(
                cid,
                desc,
                {"precomputed_signals": signals},
                {
                    "score": score,
                    "band": band,
                    "action": fraud_action(score),
                    "signals": [
                        {"signal": h.signal, "severity": h.severity, "points": h.points, "detail": h.detail}
                        for h in hits
                    ],
                },
            )
        )
    return _suite(
        "fraud_compose",
        "Fraud score composition: score = min(100, sum of round(max_points x severity)); bands clean 0-19, watch 20-39, review 40-69, high 70+; "
        "actions auto_clear / hold_for_human_review / auto_hold_and_queue.",
        "required",
        cases,
        endpoint="/v1/fraud",
        function="fraudScore(signals) + fraudAction(score)",
        reference="packages/contract/schema/formulas.mjs: fraudScore, fraudBand, fraudAction",
    )


def _organic_curve() -> list[int]:
    return [
        2200,
        3800,
        3100,
        2300,
        1700,
        1300,
        1000,
        800,
        700,
        600,
        520,
        460,
        410,
        370,
        330,
        300,
        280,
        260,
        240,
        220,
        200,
        190,
        180,
        170,
        160,
        150,
        140,
        130,
        125,
        120,
        115,
        110,
        105,
        100,
        95,
        92,
        90,
        88,
        85,
        83,
        80,
        78,
        76,
        74,
        72,
        70,
        68,
        66,
    ]


def _drip_curve() -> list[int]:
    return [180 + (i % 3) * 4 for i in range(72)]


def fraud_detect() -> dict[str, Any]:
    specs: list[tuple[str, str, dict[str, Any]]] = [
        (
            "organic_clean",
            "A healthy post: natural decay, real engagement, US audience, established account.",
            {
                "post": {
                    "views": 24_800,
                    "likes": 1900,
                    "comments": 142,
                    "shares": 210,
                    "saves": 380,
                    "hourly_views": _organic_curve(),
                    "traffic_sources": {
                        "fyp": 0.62,
                        "following": 0.2,
                        "profile": 0.06,
                        "search": 0.05,
                        "sound": 0.02,
                        "share": 0.03,
                        "other": 0.02,
                    },
                    "geo": {"US": 0.74, "CA": 0.08, "GB": 0.05},
                },
                "account": {
                    "followers": 18_400,
                    "account_age_days": 412,
                    "comment_ratio_mean_28d": 0.0055,
                    "comment_ratio_sd_28d": 0.0015,
                },
                "bounty": {
                    "target_countries": ["US"],
                    "min_target_audience_ratio": 0.5,
                    "per_video_cap_cents": 25_000,
                    "cpm_cents": 200,
                },
                "history": [
                    {"earnings_cents": 4_800, "cap_cents": 25_000},
                    {"earnings_cents": 9_100, "cap_cents": 25_000},
                    {"earnings_cents": 3_300, "cap_cents": 25_000},
                ],
            },
        ),
        (
            "bought_views_step",
            "Step function: 96% of views in two hours, 62% from 'other', new low-follower account.",
            {
                "post": {
                    "views": 61_440,
                    "likes": 140,
                    "comments": 6,
                    "shares": 11,
                    "saves": 20,
                    "hourly_views": [120, 380, 54_000, 5_100, 300, 280, 250, 230, 210, 200, 190, 180],
                    "traffic_sources": {"fyp": 0.28, "following": 0.06, "other": 0.62, "profile": 0.04},
                    "geo": {"US": 0.31, "BR": 0.33, "PH": 0.36},
                },
                "account": {"followers": 1_900, "account_age_days": 19},
                "bounty": {
                    "target_countries": ["US"],
                    "min_target_audience_ratio": 0.5,
                    "per_video_cap_cents": 25_000,
                    "cpm_cents": 200,
                },
            },
        ),
        (
            "geo_mismatch_only",
            "Audience is 15% US against 55% needed (40 points short).",
            {
                "post": {
                    "views": 12_000,
                    "likes": 800,
                    "comments": 40,
                    "shares": 60,
                    "geo": {"US": 0.15, "BR": 0.5, "MX": 0.35},
                },
                "bounty": {"target_countries": ["US"], "min_target_audience_ratio": 0.55},
            },
        ),
        (
            "new_account_follower_outlier",
            "A 6-day-old account with 900 followers and 72,000 views.",
            {
                "post": {"views": 72_000, "likes": 4_100, "comments": 210, "shares": 300},
                "account": {"followers": 900, "account_age_days": 6},
            },
        ),
        (
            "duplicate_exact",
            "Perceptual hash identical to another creator's video.",
            {"duplicate": {"phash_distance": 0, "duplicate_of": "sub_0311", "kind": "other_creator"}},
        ),
        (
            "duplicate_distance_6",
            "Distance 6: still a duplicate (severity 0.6).",
            {"duplicate": {"phash_distance": 6, "duplicate_of": "post_0201", "kind": "own_earlier"}},
        ),
        (
            "duplicate_distance_7_clear",
            "Distance 7: outside the line.",
            {"duplicate": {"phash_distance": 7, "duplicate_of": "post_0201"}},
        ),
        (
            "cap_clustering_4_of_5",
            "Four of the last five posts earned within 2% of the cap.",
            {
                "history": [
                    {"earnings_cents": 24_900, "cap_cents": 25_000},
                    {"earnings_cents": 24_700, "cap_cents": 25_000},
                    {"earnings_cents": 1_900, "cap_cents": 25_000},
                    {"earnings_cents": 25_000, "cap_cents": 25_000},
                    {"earnings_cents": 24_650, "cap_cents": 25_000},
                ]
            },
        ),
        (
            "drip_flat_curve",
            "Constant ~180 views an hour for 72 hours: no natural decay.",
            {"post": {"views": 13_080, "likes": 700, "comments": 30, "shares": 40, "hourly_views": _drip_curve()}},
        ),
        (
            "engagement_anomaly_likes",
            "Likes at 0.2% of views on a 30,000-view post.",
            {"post": {"views": 30_000, "likes": 60, "comments": 2, "shares": 1}},
        ),
        (
            "traffic_other_only",
            "70% of views from 'other' sources, otherwise normal.",
            {
                "post": {
                    "views": 20_000,
                    "likes": 1_500,
                    "comments": 90,
                    "shares": 120,
                    "traffic_sources": {"fyp": 0.25, "following": 0.05, "other": 0.70},
                }
            },
        ),
    ]
    cases = []
    for cid, desc, raw_inp in specs:
        inp = _json_safe(raw_inp)
        r = score_fraud(FraudRequest.model_validate(inp))
        cases.append(
            _case(
                cid,
                desc,
                inp,
                {
                    "score": r.score,
                    "band": r.band,
                    "action": r.action,
                    "signals": [{"signal": s.signal, "severity": s.severity, "points": s.points} for s in r.signals],
                },
            )
        )
    return _suite(
        "fraud_detect",
        "The ten fraud detectors on raw evidence: which signals fire, at what severity and points. Detector shapes are defined by the Python service "
        "(severity = f(evidence)); only the composition is contract-level.",
        "reference",
        cases,
        endpoint="/v1/fraud",
        reference="services/ml/src/flowd_ml/fraud/signals.py",
    )


# ── matching, pricing, money ────────────────────────────────────────────────────────────────────
def match_score_suite() -> dict[str, Any]:
    gates_ok = {
        "eligibility_tier": True,
        "country": True,
        "platform_account_linked": True,
        "funded": True,
        "not_already_submitted": True,
    }

    def case(
        cid: str,
        desc: str,
        gates: dict[str, bool],
        niche: float,
        platform: float,
        region: float,
        ratio: float,
        brand: float,
        age: float,
    ) -> dict[str, Any]:
        inp = {
            "gates": gates,
            "niche_overlap": niche,
            "platform_fit": platform,
            "region_fit": region,
            "price_ratio": ratio,
            "brand_reliability": brand,
            "bounty_age_days": age,
        }
        return _case(cid, desc, inp, match_score(gates, niche, platform, region, ratio, brand, age))

    cases = [
        case(
            "contract_maya_fresh_bounty",
            "The contract's example: Maya x a fresh stacked AI-photo bounty (96).",
            {"tier": True},
            1,
            1,
            1,
            1.2,
            94,
            2,
        ),
        case("contract_gate_failed", "Any failed gate returns null.", {"tier": False}, 1, 1, 1, 1.2, 94, 2),
        case(
            "contract_weak_match",
            "Half niche, 0.6 region, price 0.7, brand 60, 20 days old (59).",
            {"tier": True},
            0.5,
            1,
            0.6,
            0.7,
            60,
            20,
        ),
        case("perfect_fresh", "Everything 1, age 0: 40 + 15 + 15 + 15 + 10 + 5 = 100.", gates_ok, 1, 1, 1, 1.5, 100, 0),
        case("price_ratio_capped", "A price ratio of 3 is capped at 1.5, same as 1.5.", gates_ok, 1, 1, 1, 3, 90, 0),
        case("price_ratio_zero", "Price ratio 0 earns no price points.", gates_ok, 1, 1, 1, 0, 90, 0),
        case(
            "recency_half_life", "A 14-day-old bounty keeps half its recency points.", gates_ok, 0.5, 0.7, 1, 1, 80, 14
        ),
        case("recency_28_days", "Two half-lives: a quarter of the recency points.", gates_ok, 0.5, 0.7, 1, 1, 80, 28),
        case("rounds_half_up", "A sum landing exactly on .5 rounds up.", gates_ok, 1, 0, 0, 0, 50, 70000),
        case("funded_gate", "Not funded: null.", {**gates_ok, "funded": False}, 1, 1, 1, 1, 90, 1),
        case(
            "already_submitted_gate",
            "Already submitted: null.",
            {**gates_ok, "not_already_submitted": False},
            1,
            1,
            1,
            1,
            90,
            1,
        ),
        case("brand_reliability_clamped", "Reliability above 100 clamps to 1.", gates_ok, 0, 0, 0, 0, 140, 70000),
    ]
    return _suite(
        "match_score",
        "Match score 0-100 = niche 40 + platform 15 + region 15 + price 15 + brand reliability 10 + recency 5 (recency halves every 14 days; "
        "price fit = min(ratio, 1.5) / 1.5); null when any gate fails.",
        "required",
        cases,
        function="matchScore(inputs)",
        reference="packages/contract/schema/formulas.mjs: matchScore",
    )


def match_rank() -> dict[str, Any]:
    creator = {
        "id": "cr_maya",
        "tier": "silver",
        "country": "US",
        "niches": ["ai_tools"],
        "platforms_linked": ["tiktok"],
        "primary_platform": "tiktok",
        "audience_geo": {"US": 0.71, "CA": 0.08},
        "median_views_28d": 14_200,
        "usual_pay_cents": 3_650,
    }
    bounties = [
        {
            "id": "bnty_a_fresh_ai",
            "category": "ai_photo",
            "niches": ["ai_tools"],
            "min_tier": "bronze",
            "countries": ["US", "CA"],
            "platforms": ["tiktok", "instagram"],
            "target_countries": ["US"],
            "min_target_audience_ratio": 0.5,
            "funded": True,
            "expected_pay_cents": 4_380,
            "brand_reliability": 94,
            "age_days": 2,
        },
        {
            "id": "bnty_b_fitness",
            "category": "fitness",
            "niches": ["fitness"],
            "min_tier": "bronze",
            "countries": ["US"],
            "platforms": ["tiktok"],
            "funded": True,
            "expected_pay_cents": 6_000,
            "brand_reliability": 80,
            "age_days": 1,
        },
        {
            "id": "bnty_c_gold_only",
            "category": "ai_assistant",
            "niches": ["ai_tools", "tech"],
            "min_tier": "gold",
            "countries": ["US"],
            "platforms": ["tiktok"],
            "funded": True,
            "expected_pay_cents": 9_000,
            "brand_reliability": 97,
            "age_days": 1,
        },
        {
            "id": "bnty_d_adjacent_tech",
            "category": "productivity",
            "niches": ["tech"],
            "min_tier": "bronze",
            "countries": [],
            "platforms": ["tiktok"],
            "funded": True,
            "expected_pay_cents": 3_000,
            "brand_reliability": None,
            "age_days": 10,
        },
        {
            "id": "bnty_e_unfunded",
            "category": "ai_photo",
            "niches": ["ai_tools"],
            "funded": False,
            "expected_pay_cents": 5_000,
            "brand_reliability": 90,
            "age_days": 0,
        },
        {
            "id": "bnty_f_instagram_only",
            "category": "ai_photo",
            "niches": ["ai_tools"],
            "platforms": ["instagram"],
            "funded": True,
            "expected_pay_cents": 5_000,
            "brand_reliability": 90,
            "age_days": 0,
        },
    ]
    req = {"creator": creator, "bounties": bounties, "use_embeddings": False}
    r = rank_bounties(MatchRequest.model_validate(req), None)
    out = {
        "top_pick_bounty_id": r.top_pick_bounty_id,
        "ranked": [
            {
                "bounty_id": x.bounty_id,
                "rank": x.rank,
                "score": x.score,
                "factors": [{"key": f.key, "points": f.points} for f in x.factors],
            }
            for x in r.ranked
        ],
        "locked": [{"bounty_id": x.bounty_id, "locked_by": x.locked_by} for x in r.locked],
    }
    return _suite(
        "match_rank",
        "Ranking a bounty feed for one creator without embeddings: gates lock bounties (never silently dropped), five factors with adjacent-niche credit 0.5, "
        "ties broken by freshness then pay then id.",
        "reference",
        [_case("maya_feed", "Maya (Silver, US, ai_tools, TikTok) against six bounties.", req, out)],
        endpoint="/v1/match",
        reference="services/ml/src/flowd_ml/matching/rank.py",
    )


def price_curve_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, clearing, hours, n in (
        (
            "contract_ai_photo_38",
            "The contract's example: AI photo & video, $2.40, 31 h, 38 comparable bounties.",
            240,
            31,
            38,
        ),
        ("contract_thin_market_6", "The contract's thin-market example: 6 comparable bounties.", 170, 52, 6),
        ("fitness_default", "A mid-market category.", 190, 28, 120),
        (
            "tiny_clearing_floor_hours",
            "Fast category: the 6-hour fill floor binds at the top of the curve.",
            100,
            7,
            25,
        ),
        ("no_samples", "Zero comparable bounties: confidence 0, thin market.", 200, 30, 0),
    ):
        inp = {"clearing_cpm_cents": clearing, "median_fill_hours": hours, "sample_n": n}
        out = [
            {
                "cpm_cents": p.cpm_cents,
                "fill_hours_p50": p.fill_hours_p50,
                "fill_hours_p80": p.fill_hours_p80,
                "confidence": p.confidence,
                "sample_n": p.sample_n,
            }
            for p in price_curve(clearing, hours, n)
        ]
        cases.append(_case(cid, desc, inp, out))
    return _suite(
        "price_curve",
        "Price vs fill time: six points at 0.6x/0.8x/1.0x/1.2x/1.5x/2.0x of the clearing CPM; p50 = max(6, H x (clearing/cpm)^1.6), p80 = p50 x 1.8, "
        "confidence = n/(n+20) x (1 - min(0.5, |ln(cpm/clearing)|)).",
        "required",
        cases,
        function="priceCurve(args)",
        reference="packages/contract/schema/formulas.mjs: priceCurve",
    )


def fill_time_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, cpm, clearing, hours, n in (
        ("at_clearing", "At the clearing price the fill time is the category median.", 240, 240, 31, 38),
        ("double_price", "2x the clearing price.", 480, 240, 31, 38),
        ("half_price", "Half the clearing price: (1/0.5)^1.6 = 3.03x slower.", 120, 240, 31, 38),
        ("floor_6_hours", "A very high price hits the 6-hour floor.", 1000, 240, 31, 38),
        ("thin_7", "7 comparable bounties is still thin (limit 8).", 240, 240, 31, 7),
        ("not_thin_8", "8 comparable bounties is not thin.", 240, 240, 31, 8),
        ("confidence_distance_cap", "The distance damping caps at 0.5.", 1200, 240, 31, 200),
    ):
        f = fill_time(cpm, clearing, hours, n)
        cases.append(
            _case(
                cid,
                desc,
                {"cpm_cents": cpm, "clearing_cpm_cents": clearing, "median_fill_hours": hours, "sample_n": n},
                {
                    "fill_hours_p50": f.fill_hours_p50,
                    "fill_hours_p80": f.fill_hours_p80,
                    "confidence": f.confidence,
                    "thin_market": f.thin_market,
                },
            )
        )
    return _suite(
        "fill_time",
        "One point of the price-vs-fill model.",
        "required",
        cases,
        function="fillTime(args)",
        reference="packages/contract/schema/formulas.mjs: fillTime",
    )


def suggest_cpm_suite() -> dict[str, Any]:
    market = {
        "clearing_cpm_cents": 240,
        "p25_cpm_cents": 190,
        "p75_cpm_cents": 310,
        "median_fill_hours": 31,
        "sample_n": 38,
        "median_views": 14_200,
    }
    specs: list[tuple[str, str, dict[str, Any]]] = [
        (
            "balanced_pro_5000",
            "Balanced suggestion on Pro with a $5,000 pool and a candidate price.",
            {
                "category": "ai_photo",
                "market": market,
                "plan": "pro",
                "budget_cents": 500_000,
                "cpa": {"install_cents": 40, "trial_cents": 150, "paid_cents": 400},
                "candidate_cpm_cents": 192,
            },
        ),
        (
            "fastest",
            "Fastest: 1.5x the clearing price.",
            {"category": "ai_photo", "market": market, "priority": "fastest"},
        ),
        (
            "cheapest",
            "Cheapest: 0.8x the clearing price.",
            {"category": "ai_photo", "market": market, "priority": "cheapest"},
        ),
        (
            "target_fill_12h",
            "Solve for a 12-hour fill.",
            {"category": "ai_photo", "market": market, "target_fill_hours": 12},
        ),
        (
            "target_fill_impossible",
            "A 3-hour target floors at 6 hours and is capped at 2x with a warning.",
            {"category": "ai_photo", "market": market, "target_fill_hours": 3},
        ),
        (
            "thin_market",
            "Six comparable bounties: thin-market warning.",
            {"category": "finance", "market": {"clearing_cpm_cents": 280, "median_fill_hours": 40, "sample_n": 6}},
        ),
        (
            "category_default",
            "No market data: the day-one category default, labelled as such.",
            {"category": "fitness"},
        ),
        (
            "first_bounty_matched",
            "First bounty on Pro: fee waived, flowd matches $500.",
            {"category": "ai_photo", "market": market, "plan": "pro", "first_bounty": True, "budget_cents": 150_000},
        ),
        (
            "low_pay_warning",
            "A cheap category with a low cap: the Brief Lint low-pay warning appears.",
            {
                "category": "lifestyle",
                "market": {"clearing_cpm_cents": 60, "median_fill_hours": 20, "sample_n": 50, "median_views": 6_000},
                "per_video_cap_cents": 25_000,
            },
        ),
    ]
    cases = []
    for cid, desc, inp in specs:
        r = suggest_cpm(SuggestCpmRequest.model_validate(inp))
        out = {
            "source": r.source,
            "suggested_cpm_cents": r.suggested_cpm_cents,
            "thin_market": r.thin_market,
            "fill": {"p50_hours": r.fill.p50_hours, "p80_hours": r.fill.p80_hours, "confidence": r.fill.confidence},
            "curve": [
                {"cpm_cents": p.cpm_cents, "fill_hours_p50": p.fill_hours_p50, "all_in_cpm_cents": p.all_in_cpm_cents}
                for p in r.curve
            ],
            "all_in": None
            if r.all_in is None
            else {"card_charge_cents": r.all_in.card_charge_cents, "all_in_cpm_cents": r.all_in.all_in_cpm_cents},
            "creator_pay": None
            if r.creator_pay is None
            else {
                "p25_cents": r.creator_pay.p25_cents,
                "median_cents": r.creator_pay.median_cents,
                "p75_cents": r.creator_pay.p75_cents,
            },
            "warnings_count": len(r.warnings),
        }
        cases.append(_case(cid, desc, inp, out))
    return _suite(
        "suggest_cpm",
        "Suggested CPM, the price-vs-fill curve with all-in prices, and the creator's expected pay at that price.",
        "reference",
        cases,
        endpoint="/v1/suggest-cpm",
        reference="services/ml/src/flowd_ml/pricing/suggest.py",
    )


def funding_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, budget, rate, matched in (
        ("contract_free_5000", "Free plan, $5,000 pool (12%): card charge $5,762.70.", 500_000, 0.12, 0),
        ("contract_pro_3000", "Pro, $3,000 pool (10%).", 300_000, 0.10, 0),
        ("contract_cpa_only", "CPA-only bounty (6%).", 120_000, 0.06, 0),
        ("scale_8_percent", "Scale plan (8%), $10,000 pool.", 1_000_000, 0.08, 0),
        ("zero_fee", "No fee (first bounty), no match.", 100_000, 0.0, 0),
        ("matched_500", "A $2,000 pool of which flowd funds $500.", 200_000, 0.0, 50_000),
        ("tiny_pool_rounding", "A $100 pool at 12%: processing 2.9% + $0.30 rounds half up.", 10_000, 0.12, 0),
    ):
        f = funding(budget, rate, matched)
        cases.append(
            _case(cid, desc, {"budget_cents": budget, "take_rate": rate, "matched_cents": matched}, f.as_dict())
        )
    return _suite(
        "funding",
        "Escrow funding: fee_reserve = round(B x take_rate); escrow_total = B + fee_reserve; brand_funded = escrow_total - matched; processing = round(2.9% x brand_funded) + 30; "
        "card_charge = brand_funded + processing.",
        "required",
        cases,
        function="funding(args)",
        reference="packages/contract/schema/formulas.mjs: funding",
    )


def first_bounty_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, funds in (
        ("contract_1500", "The contract's example: brand funds $1,500, flowd matches $500.", 150_000),
        ("contract_300", "Brand funds $300: matched = $300 (min of $500 and what the brand funds).", 30_000),
        ("exactly_500", "Brand funds exactly $500.", 50_000),
        ("above_cap", "Brand funds $5,000: matched stays $500.", 500_000),
        ("one_cent", "One cent.", 1),
    ):
        cases.append(_case(cid, desc, {"brand_funds_cents": funds}, first_bounty_funding(funds).as_dict()))
    return _suite(
        "first_bounty_funding",
        "First bounty: fee waived, flowd matches min($500, what the brand funds) on top.",
        "required",
        cases,
        function="firstBountyFunding(args)",
        reference="packages/contract/schema/formulas.mjs: firstBountyFunding",
    )


def all_in_cpm_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, cpm, budget, charge in (
        ("contract_free_5000", "$2.00 CPM on a $5,000 Free-plan pool (all-in $2.31).", 200, 500_000, 576_270),
        ("contract_first_bounty", "$2.00 CPM, first bounty (all-in $1.54).", 200, 200_000, 154_380),
        ("zero_cpm", "CPM 0 returns 0.", 0, 500_000, 576_270),
        ("zero_budget", "Budget 0 returns 0.", 200, 0, 0),
        ("rounds_half_up", "Half rounds up.", 250, 100_000, 111_000),
    ):
        cases.append(
            _case(
                cid,
                desc,
                {"cpm_cents": cpm, "budget_cents": budget, "card_charge_cents": charge},
                all_in_cpm(cpm, budget, charge),
            )
        )
    return _suite(
        "all_in_cpm",
        "All-in effective CPM = round(card_charge x cpm / budget).",
        "required",
        cases,
        function="allInCpm(args)",
        reference="packages/contract/schema/formulas.mjs: allInCpm",
    )


def expected_earnings_suite() -> dict[str, Any]:
    cases = []
    for cid, desc, views, cpm, cap, rates in (
        (
            "contract_stacked_2_10",
            "The contract's example: $2.10 CPM + $0.40/$1.50/$4.00, median 14,200 views, $250 cap.",
            14_200,
            210,
            25_000,
            (40, 150, 400),
        ),
        ("cpm_only", "CPM-only bounty.", 14_200, 200, 25_000, (0, 0, 0)),
        ("cap_binds_p75", "A big creator: the cap binds at p75 and the median.", 120_000, 250, 25_000, (40, 150, 400)),
        ("tiny_creator", "A new creator with 800 median views.", 800, 200, 25_000, (40, 150, 400)),
        ("zero_views", "Zero median views.", 0, 200, 25_000, (40, 150, 400)),
    ):
        inp = {
            "base_median_views": views,
            "cpm_cents": cpm,
            "rates": {"install": rates[0], "trial": rates[1], "paid": rates[2]},
            "per_video_cap_cents": cap,
        }
        e = expected_earnings(views, cpm, cap, *rates)
        cases.append(_case(cid, desc, inp, {k: v.as_dict() for k, v in e.items()}))
    return _suite(
        "expected_earnings",
        "Pay Math: expected pay at p25 / median / p75 views (0.40x / 1.0x / 2.55x), funnel 0.45% visits -> 38% installs -> 6.2% trials -> 34.8% paid, "
        "capped per video. Always an estimate.",
        "required",
        cases,
        function="expectedEarnings(args)",
        reference="packages/contract/schema/formulas.mjs: expectedEarnings",
    )


# ── perceptual hash ─────────────────────────────────────────────────────────────────────────────
def _img(w: int, h: int, f: Callable[[int, int], int]) -> bytes:
    return bytes(max(0, min(255, f(x, y))) for y in range(h) for x in range(w))


def _lcg(seed: int) -> Callable[[], int]:
    state = seed

    def nxt() -> int:
        nonlocal state
        state = (1103515245 * state + 12345) % 2_147_483_648
        return (state >> 16) % 7 - 3

    return nxt


def _scene(
    w: int,
    h: int,
    *,
    ramp: str = "h",
    rect: tuple[int, int, int, int] = (10, 12, 30, 40),
    circle: tuple[int, int, int] = (44, 44, 10),
    extra: int = 0,
    noise: Callable[[], int] | None = None,
) -> bytes:
    """A small synthetic 'scene' on a 64x64 grid (sampled at any size): a ramp, a bright rectangle and a disc. Plenty of low-frequency
    structure, so unlike a bare gradient its hash bits are decided by content and not by floating-point noise."""

    def pixel(x: int, y: int) -> int:
        u, v = x * 64 // w, y * 64 // h
        value = 20 + (u if ramp == "h" else v)
        if rect[0] <= u < rect[2] and rect[1] <= v < rect[3]:
            value += 60
        if (u - circle[0]) ** 2 + (v - circle[1]) ** 2 < circle[2] ** 2:
            value += 50
        return value + extra + (noise() if noise else 0)

    return _img(w, h, pixel)


def phash_suite() -> dict[str, Any]:
    noise = _lcg(42)
    grad = lambda x, y: round(255 * x / 63)  # noqa: E731
    images: dict[str, tuple[int, int, bytes]] = {
        "scene_a_64": (64, 64, _scene(64, 64)),
        "scene_a_64_brighter": (64, 64, _scene(64, 64, extra=25)),
        "scene_a_64_noisy": (64, 64, _scene(64, 64, noise=noise)),
        "scene_a_32": (32, 32, _scene(32, 32)),
        "scene_b_64": (64, 64, _scene(64, 64, ramp="v", rect=(34, 6, 58, 30), circle=(16, 40, 14))),
        "gradient_h_64": (64, 64, _img(64, 64, grad)),
        "gradient_h_64_brighter": (64, 64, _img(64, 64, lambda x, y: grad(x, y) + 25)),
        "gradient_v_64": (64, 64, _img(64, 64, lambda x, y: round(255 * y / 63))),
        "circle_64": (64, 64, _img(64, 64, lambda x, y: 255 if (x - 32) ** 2 + (y - 32) ** 2 < 18**2 else 30)),
        "circle_64_shifted": (64, 64, _img(64, 64, lambda x, y: 255 if (x - 34) ** 2 + (y - 31) ** 2 < 18**2 else 30)),
        "stripes_diag_64": (64, 64, _img(64, 64, lambda x, y: 255 if ((x + y) // 8) % 2 else 40)),
        "checker_64": (64, 64, _img(64, 64, lambda x, y: 255 if ((x // 8) + (y // 8)) % 2 == 0 else 0)),
        "blocks_48x40": (48, 40, _img(48, 40, lambda x, y: (x * y * 3 + x * 7) % 256)),
        "gradient_h_32": (32, 32, _img(32, 32, lambda x, y: round(255 * x / 31))),
    }
    cases: list[dict[str, Any]] = []
    hashes: dict[str, str] = {}
    for name, (w, h, data) in images.items():
        hx = to_hex(phash_gray(data, w, h))
        hashes[name] = hx
        cases.append(
            _case(
                f"hash_{name}",
                f"pHash of the {w}x{h} image '{name}'.",
                {"fn": "phash_gray", "width": w, "height": h, "gray_b64": base64.b64encode(data).decode("ascii")},
                {"phash": hx},
            )
        )
    for a, b, desc, duplicate in (
        ("scene_a_64", "scene_a_64_brighter", "A brightness shift is a duplicate.", True),
        ("scene_a_64", "scene_a_64_noisy", "Compression-like noise is a duplicate.", True),
        ("scene_a_64", "scene_a_32", "The same scene rendered at half the size is a duplicate.", True),
        ("scene_a_64", "scene_b_64", "A different scene is not.", False),
        ("gradient_h_64", "gradient_h_64_brighter", "A brightness shift of a bare gradient is a duplicate.", True),
        ("gradient_h_64", "gradient_h_32", "A bare gradient at half the size is a duplicate.", True),
        (
            "gradient_h_64",
            "gradient_v_64",
            "Known limitation: bare ramps carry almost no low-frequency detail, so a horizontal and a vertical ramp collide. Real footage has texture.",
            True,
        ),
        ("circle_64", "checker_64", "Different images differ.", False),
        ("stripes_diag_64", "blocks_48x40", "Different images differ.", False),
        ("scene_a_64", "checker_64", "A scene and a checkerboard differ.", False),
    ):
        d = hamming_hex(hashes[a], hashes[b])
        assert (d <= 6) is duplicate, f"vector description is false for {a} vs {b}: distance {d}"
        cases.append(
            _case(
                f"distance_{a}_vs_{b}",
                desc,
                {"fn": "hamming_hex", "a": hashes[a], "b": hashes[b]},
                {"distance": d, "duplicate": d <= 6},
            )
        )
    vote = [hashes["scene_a_64"], hashes["scene_a_64_brighter"], hashes["scene_a_64_noisy"]]
    cases.append(
        _case(
            "majority_three_frames",
            "Video fingerprint: bitwise majority of three frame hashes.",
            {"fn": "majority_hash", "hashes": vote},
            {"phash": to_hex(majority_hash(int(v, 16) for v in vote))},
        )
    )
    vote2 = [hashes["circle_64"], hashes["checker_64"]]
    cases.append(
        _case(
            "majority_tie_votes_zero",
            "Two frames: a bit is 1 only when both agree (ties vote 0).",
            {"fn": "majority_hash", "hashes": vote2},
            {"phash": to_hex(majority_hash(int(v, 16) for v in vote2))},
        )
    )
    return _suite(
        "phash",
        "64-bit DCT perceptual hash: grayscale -> 32x32 area average (fractional box weights) -> unnormalised 2D DCT-II -> 8x8 low band -> bit = coefficient > median(64 coefficients) + 1e-6, "
        "row-major, MSB first, 16 lowercase hex characters. Duplicate = Hamming distance <= 6. Video hash = bitwise majority across keyframes (ties vote 0).",
        "required",
        cases,
        endpoint="/v1/phash/from-frames",
        reference="services/ml/src/flowd_ml/phash/core.py",
    )


# ── QA, text, fatigue, calibration ──────────────────────────────────────────────────────────────
_QA_BASE: dict[str, Any] = {
    "media": {"duration_ms": 24_000, "width": 1080, "height": 1920},
    "transcript": [
        {"t_start_ms": 300, "t_end_ms": 2100, "text": "I was wrong about AI photo apps."},
        {"t_start_ms": 2200, "t_end_ms": 4800, "text": "This is a paid partnership with Lumi, and look at this."},
        {"t_start_ms": 9600, "t_end_ms": 14000, "text": "Wow, no way. The result is so good."},
        {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Try it free for seven days, link in bio."},
    ],
    "on_screen_text": [
        {"t_start_ms": 400, "t_end_ms": 2400, "text": "I was wrong about AI photo apps", "in_safe_zone": True},
        {"t_start_ms": 2500, "t_end_ms": 5000, "text": "#ad Paid partnership with Lumi", "in_safe_zone": True},
    ],
    "scenes": [
        {"t_start_ms": 0, "t_end_ms": 1200, "kind": "face"},
        {"t_start_ms": 1200, "t_end_ms": 14000, "kind": "screen_recording"},
        {"t_start_ms": 14000, "t_end_ms": 24000, "kind": "face"},
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


def _qa(**over: Any) -> dict[str, Any]:
    out = json.loads(json.dumps(_QA_BASE))
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


def qa_suite() -> dict[str, Any]:
    specs: list[tuple[str, str, dict[str, Any]]] = [
        ("clean_pass", "A compliant video: every check that has input passes.", _qa()),
        (
            "no_spoken_disclosure",
            "No #ad spoken: fails and blocks settlement.",
            _qa(
                transcript=[
                    {"t_start_ms": 300, "t_end_ms": 2100, "text": "I was wrong about AI photo apps."},
                    {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Try it free, link in bio."},
                ]
            ),
        ),
        (
            "no_onscreen_disclosure",
            "No #ad on screen: fails and blocks settlement.",
            _qa(
                on_screen_text=[
                    {
                        "t_start_ms": 400,
                        "t_end_ms": 2400,
                        "text": "I was wrong about AI photo apps",
                        "in_safe_zone": True,
                    }
                ]
            ),
        ),
        (
            "late_spoken_disclosure",
            "Disclosure spoken at 20 s of 24 s: a warning, not a block.",
            _qa(
                transcript=[
                    {"t_start_ms": 300, "t_end_ms": 2100, "text": "I was wrong about AI photo apps."},
                    {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Paid partnership with Lumi. Link in bio."},
                ]
            ),
        ),
        (
            "short_onscreen_disclosure",
            "#ad visible for 1.4 s: a warning (needs 2 s).",
            _qa(on_screen_text=[{"t_start_ms": 2500, "t_end_ms": 3900, "text": "#ad", "in_safe_zone": True}]),
        ),
        (
            "banned_claim_said",
            "A brand banned claim is spoken: fails with the transcript line as evidence.",
            _qa(
                transcript=[
                    {"t_start_ms": 300, "t_end_ms": 2100, "text": "Lumi gives you guaranteed results."},
                    {"t_start_ms": 2200, "t_end_ms": 4800, "text": "Paid partnership with Lumi."},
                    {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Link in bio."},
                ]
            ),
        ),
        (
            "platform_risky_claim",
            "A platform-level risky claim only warns.",
            _qa(
                transcript=[
                    {"t_start_ms": 300, "t_end_ms": 2100, "text": "This is a get rich app."},
                    {"t_start_ms": 2200, "t_end_ms": 4800, "text": "Paid partnership with Lumi."},
                    {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Link in bio."},
                ]
            ),
        ),
        (
            "music_original_only",
            "Music on an original-audio-only bounty: fails.",
            _qa(audio={"music_detected": True, "music_licensed": True}, brief={"music_policy": "original_only"}),
        ),
        (
            "music_unlicensed",
            "Music that is not a commercial-library track: fails.",
            _qa(audio={"music_detected": True, "music_licensed": False}),
        ),
        ("ai_unlabelled", "AI-generated (0.9) with no label: fails.", _qa(vision={"ai_generated_probability": 0.9})),
        (
            "ai_labelled",
            "AI-generated and labelled on screen: passes.",
            _qa(
                vision={"ai_generated_probability": 0.9},
                on_screen_text=[
                    {"t_start_ms": 400, "t_end_ms": 3400, "text": "#ad AI-generated", "in_safe_zone": True}
                ],
            ),
        ),
        (
            "ai_not_allowed",
            "AI-generated where the brief forbids it: fails even when labelled.",
            _qa(
                vision={"ai_generated_probability": 0.9},
                brief={"ai_policy": "not_allowed"},
                on_screen_text=[
                    {"t_start_ms": 400, "t_end_ms": 3400, "text": "#ad AI-generated", "in_safe_zone": True}
                ],
            ),
        ),
        (
            "duplicate_exact",
            "Hash identical to another creator's video: fails (unoriginal_clip).",
            _qa(
                phash="bf2183365fb6e014",
                known_hashes=[{"id": "sub_0311", "phash": "bf2183365fb6e014", "kind": "other_creator"}],
            ),
        ),
        (
            "duplicate_own_repost",
            "Hash close to the creator's own earlier post: fails (duplicate_content).",
            _qa(
                phash="bf2183365fb6e014",
                known_hashes=[{"id": "post_0201", "phash": "bf2183365fb6e016", "kind": "own_earlier"}],
            ),
        ),
        (
            "duplicate_near",
            "Distance 9: a warning.",
            _qa(
                phash="bf2183365fb6e014",
                known_hashes=[{"id": "sub_0311", "phash": "bf2183365fb6e5b5", "kind": "other_creator"}],
            ),
        ),
        ("watermark", "Another app's watermark: fails.", _qa(vision={"watermarks": ["ClipCut"]})),
        (
            "competitor_on_screen",
            "A competitor named in on-screen text: fails (competitor_shown).",
            _qa(
                brief={"competitor_names": ["PixelPal"]},
                on_screen_text=[
                    {"t_start_ms": 400, "t_end_ms": 2400, "text": "better than PixelPal", "in_safe_zone": True},
                    {
                        "t_start_ms": 2500,
                        "t_end_ms": 5000,
                        "text": "#ad Paid partnership with Lumi",
                        "in_safe_zone": True,
                    },
                ],
            ),
        ),
        (
            "missing_beat",
            "A required offer beat is missing: warns (2 of 3 found, coverage 0.67).",
            _qa(
                transcript=[t for t in _QA_BASE["transcript"] if "Try it free" not in t["text"]],
                brief={
                    "beats": [
                        {"beat": "hook", "required": True},
                        {"beat": "app_reveal", "required": True},
                        {"beat": "offer", "required": True},
                    ]
                },
            ),
        ),
        (
            "beats_mostly_missing",
            "Most required beats missing: fails.",
            _qa(
                transcript=[
                    {"t_start_ms": 300, "t_end_ms": 2100, "text": "Hello."},
                    {"t_start_ms": 2200, "t_end_ms": 4800, "text": "Paid partnership with Lumi."},
                ],
                scenes=[{"t_start_ms": 0, "t_end_ms": 24000, "kind": "face"}],
                brief={
                    "beats": [
                        {"beat": "proof", "required": True},
                        {"beat": "offer", "required": True},
                        {"beat": "demo", "required": True},
                        {"beat": "win_state", "required": True},
                    ]
                },
            ),
        ),
        (
            "text_outside_safe_zone",
            "Most on-screen text outside the safe zone: fails.",
            _qa(
                on_screen_text=[
                    {"t_start_ms": 400, "t_end_ms": 2400, "text": "I was wrong", "in_safe_zone": False},
                    {
                        "t_start_ms": 2500,
                        "t_end_ms": 5000,
                        "text": "#ad Paid partnership with Lumi",
                        "in_safe_zone": False,
                    },
                ]
            ),
        ),
        (
            "landscape",
            "1920x1080 is not 9:16: fails.",
            _qa(media={"duration_ms": 24_000, "width": 1920, "height": 1080}),
        ),
        (
            "too_long",
            "58 s against a 15-60 s... brief capped at 30 s: fails.",
            _qa(media={"duration_ms": 58_000, "width": 1080, "height": 1920}, brief={"max_duration_s": 30}),
        ),
        (
            "a_little_long",
            "32 s against a 30 s cap: warns.",
            _qa(media={"duration_ms": 32_000, "width": 1080, "height": 1920}, brief={"max_duration_s": 30}),
        ),
        (
            "low_resolution",
            "540x960: below the 720x1280 minimum, fails.",
            _qa(media={"duration_ms": 24_000, "width": 540, "height": 960}),
        ),
        (
            "dead_air",
            "Three silences over a second: fails.",
            _qa(audio={"dead_air_gaps_ms": [1800, 1500, 1200], "speech_ratio": 0.6}),
        ),
        ("moderation", "Moderation score 0.86: fails.", _qa(vision={"moderation": {"sexual": 0.86, "violence": 0.01}})),
    ]
    cases = []
    for cid, desc, inp in specs:
        r = run_qa(QaRequest.model_validate(inp))
        cases.append(
            _case(
                cid,
                desc,
                inp,
                {
                    "verdict": r.verdict,
                    "passed": r.passed,
                    "auto_approvable": r.auto_approvable,
                    "blocks_settlement": r.blocks_settlement,
                    "suggested_reason_code": r.suggested_reason_code,
                    "checks": [
                        {
                            "check": c.check,
                            "result": c.result,
                            "blocks_settlement": c.blocks_settlement,
                            "reason_code": c.reason_code,
                        }
                        for c in r.checks
                    ],
                    "skipped": list(r.skipped),
                },
            )
        )
    return _suite(
        "qa",
        "Auto-QA over transcript, on-screen text, scenes, audio and vision facts against the brief: 14 checks, pass / warn / fail, reason codes. "
        "Disclosure failures block settlement. Checks with no input are skipped, never silently passed.",
        "reference",
        cases,
        endpoint="/v1/qa",
        reference="services/ml/src/flowd_ml/qa/",
    )


def beats_suite() -> dict[str, Any]:
    cases: list[dict[str, Any]] = []
    req = QaRequest.model_validate(_qa())
    ctx = BeatContext(
        duration_ms=24_000,
        transcript=req.transcript,
        on_screen_text=req.on_screen_text,
        scenes=req.scenes,
        app_name="Lumi",
        cta="Link in bio",
    )
    for beat in ("hook", "app_reveal", "demo", "cta", "win_state", "reaction", "offer", "problem"):
        cases.append(
            _case(
                f"locate_{beat}",
                f"Where the {beat} beat is found in the clean QA video.",
                {"fn": "locate_beat", "beat": beat, "context": "qa_clean_video"},
                {"t_ms": locate_beat(beat, ctx)},
            )
        )
    order_specs = [
        (
            "in_order_screen_reaction",
            "tmpl_screen_reaction",
            [
                ("hook", 300),
                ("app_reveal", 1200),
                ("demo", 5000),
                ("reaction", 9600),
                ("payoff", 14200),
                ("cta", 20400),
            ],
        ),
        (
            "one_off",
            "tmpl_screen_reaction",
            [
                ("hook", 300),
                ("demo", 1200),
                ("app_reveal", 5000),
                ("reaction", 9600),
                ("payoff", 14200),
                ("cta", 20400),
            ],
        ),
        (
            "out_of_order",
            "tmpl_screen_reaction",
            [
                ("cta", 300),
                ("payoff", 1200),
                ("reaction", 5000),
                ("demo", 9600),
                ("app_reveal", 14200),
                ("hook", 20400),
            ],
        ),
        ("missing_beats_ignored", "tmpl_hidden_gem", [("hook", 300), ("cta", 20400)]),
        ("generic_order", None, [("hook", 300), ("problem", 2000), ("demo", 6000), ("payoff", 12000), ("cta", 20000)]),
    ]
    for cid, fmt, hits in order_specs:
        beat_hits = [BeatHit(beat=b, required=False, found=True, t_ms=t) for b, t in hits]  # type: ignore[arg-type]
        cases.append(
            _case(
                f"order_{cid}",
                f"Format order for {fmt or 'no chosen format'}.",
                {
                    "fn": "infer_format_order",
                    "format_id": fmt,
                    "hits": [{"beat": b, "found": True, "t_ms": t} for b, t in hits],
                },
                {"format_order": infer_format_order(beat_hits, fmt)},
            )
        )
    detect = detect_beats(
        [
            BriefBeatIn(beat="hook"),
            BriefBeatIn(beat="app_reveal"),
            BriefBeatIn(beat="offer"),
            BriefBeatIn(beat="proof", required=False),
        ],
        ctx,
    )
    cases.append(
        _case(
            "detect_brief_beats",
            "detect_beats over a four-beat brief.",
            {
                "fn": "detect_beats",
                "brief_beats": ["hook", "app_reveal", "offer", "proof"],
                "context": "qa_clean_video",
            },
            {"beats": [{"beat": h.beat, "found": h.found, "t_ms": h.t_ms} for h in detect]},
        )
    )
    return _suite(
        "beats",
        "Beat detection and format-order inference (keyword rules over transcript, on-screen text and scenes).",
        "reference",
        cases,
        reference="services/ml/src/flowd_ml/qa/beats.py",
    )


def hook_type_suite() -> dict[str, Any]:
    lines = [
        "I was wrong about AI photo apps.",
        "I didn't expect to use this app every day.",
        "Confession: I never edit by hand anymore.",
        "POV: you finally found a workout app you don't quit.",
        "Why is nobody talking about this app?",
        "12 minutes a day, 30 days, here's what changed.",
        "I didn't pay a cent for the first week.",
        "Wait until you see what this did to my mornings.",
        "And that's when I knew.",
        "Hey guys, welcome back to my channel.",
        "So today I want to show you a photo app.",
        "This app scans your receipts.",
        "Is this the best budget app?",
        "You can try it free for seven days.",
        "$40 a month, gone.",
        "",
        "The one thing nobody tells you about sleep.",
    ]
    cases = [
        _case(
            f"line_{i:02d}",
            text or "(empty)",
            {"fn": "classify_hook_text", "text": text},
            {"hook_type": classify_hook_text(text)},
        )
        for i, text in enumerate(lines)
    ]
    return _suite(
        "hook_type",
        "Keyword classifier for the first spoken line: library hook type or null (not a library hook type).",
        "reference",
        cases,
        reference="services/ml/src/flowd_ml/scoring/hook_types.py",
    )


def fatigue_suite() -> dict[str, Any]:
    def series(values: list[float], volume: int = 90, start_day: int = 1) -> list[dict[str, Any]]:
        return [{"date": f"2026-09-{start_day + i:02d}", "value": v, "volume": volume} for i, v in enumerate(values)]

    specs: list[tuple[str, str, dict[str, Any]]] = [
        (
            "fatigued_36_percent",
            "Trial-start rate falls from a 7.8% smoothed peak to 5.0%: fatigued.",
            {
                "metric": "trial_rate",
                "series": series([0.071, 0.074, 0.078, 0.080, 0.077, 0.072, 0.066, 0.061, 0.056, 0.052, 0.050, 0.049]),
            },
        ),
        (
            "watch_22_percent",
            "A 22% drop: watch, no alert yet.",
            {
                "metric": "trial_rate",
                "series": series([0.070, 0.072, 0.074, 0.073, 0.068, 0.062, 0.058, 0.056, 0.057, 0.058]),
            },
        ),
        (
            "healthy_rising",
            "Still rising: healthy.",
            {"metric": "ctr", "series": series([0.010, 0.011, 0.012, 0.012, 0.013, 0.014, 0.014, 0.015])},
        ),
        (
            "insufficient_days",
            "Five days of data: not enough.",
            {"metric": "trial_rate", "series": series([0.07, 0.07, 0.06, 0.06, 0.05])},
        ),
        (
            "noisy_days_ignored",
            "Days under the volume floor are ignored.",
            {
                "metric": "install_rate",
                "min_volume": 100,
                "series": series([1.9, 2.0, 2.1, 2.0, 2.0, 1.9, 2.0, 2.1], volume=40),
            },
        ),
        (
            "exactly_30_percent",
            "Exactly a 30% drop alerts (>= 0.30).",
            {"metric": "trial_rate", "series": series([0.10, 0.10, 0.10, 0.10, 0.08, 0.07, 0.07, 0.07])},
        ),
    ]
    cases = []
    for cid, desc, inp in specs:
        r = detect_fatigue(FatigueRequest.model_validate(inp))
        cases.append(
            _case(
                cid,
                desc,
                inp,
                {
                    "state": r.state,
                    "drop_ratio": r.drop_ratio,
                    "peak_on": r.peak_on,
                    "peak_value": r.peak_value,
                    "current_value": r.current_value,
                },
            )
        )
    return _suite(
        "fatigue",
        "Fatigue rule: trailing 3-day median rate down >= 30% from its peak is an alert; 20-30% is a watch; fewer than 7 usable days is insufficient data.",
        "reference",
        cases,
        endpoint="/v1/fatigue",
        reference="services/ml/src/flowd_ml/fatigue/detect.py",
    )


def calibration_suite() -> dict[str, Any]:
    posts: list[dict[str, Any]] = []
    plan = {
        "A": (40, 2.0, 0.09),
        "B": (60, 1.3, 0.07),
        "C": (70, 0.95, 0.06),
        "D": (45, 0.6, 0.05),
        "E": (25, 0.4, 0.04),
    }
    n = 0
    for band, (count, mult, trial_rate) in plan.items():
        for i in range(count):
            n += 1
            jitter = 1 + ((i * 37) % 21 - 10) / 100
            views = round(10_000 * mult * jitter)
            installs = max(1, round(views / 600))
            posts.append(
                {
                    "post_id": f"post_{n:04d}",
                    "app_id": f"app_{(i % 5) + 1}",
                    "predicted_band": band,
                    "predicted_points": {"A": 90, "B": 77, "C": 62, "D": 47, "E": 30}[band] + (i % 5),
                    "window_views": views,
                    "installs": installs,
                    "trials": round(installs * trial_rate),
                    "creator_median_views_28d": 10_000,
                }
            )
    inp = {"model_name": "creative-scorer", "model_stage": "heuristic", "posts": posts}
    r = build_report(CalibrationRequest.model_validate(inp))
    out = {
        "n_posts": r.n_posts,
        "n_apps": r.n_apps,
        "monotone": r.monotone,
        "spearman": r.spearman,
        "top_vs_bottom": r.top_vs_bottom,
        "recommendation": r.recommendation,
        "bins": [
            {
                "band": b.band,
                "count": b.count,
                "median_views": b.median_views,
                "trial_rate": b.trial_rate,
                "median_lift_multiple": b.median_lift_multiple,
            }
            for b in r.bins
        ],
    }
    return _suite(
        "calibration",
        f"Calibration bins (the contract's CalibrationBin: band, count, median views, trial rate) on 240 settled posts. {CHECKLIST_LABEL}",
        "reference",
        [_case("heuristic_240_posts", "A well-separated checklist on 240 posts across 5 apps.", inp, out)],
        endpoint="/v1/calibration/report",
        reference="services/ml/src/flowd_ml/calibration/report.py",
    )


def video_analysis_suite() -> dict[str, Any]:
    from .schemas.video import AnalyzeVideoRequest
    from .video.adapters.fake import fake_adapters
    from .video.pipeline import VideoPipeline

    pipeline = VideoPipeline(fake_adapters(), lambda: "2026-10-03T14:00:00Z")
    brief = {
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
    }
    cases = []
    for scenario in (
        "strong_screen_reaction",
        "slow_hook_no_disclosure",
        "faceless_slideshow",
        "banned_claim",
        "ai_unlabelled",
        "watermark_competitor",
        "long_landscape",
        "unsafe_content",
    ):
        inp = {
            "submission_id": "sub_0412",
            "version": 1,
            "video": {"uri": f"fake://{scenario}?seed=412"},
            "brief": brief,
            "creator_median_views": 14_200,
        }
        r = pipeline.analyze(AnalyzeVideoRequest.model_validate(inp))
        cases.append(
            _case(
                scenario,
                f"The fake adapters' '{scenario}' scenario end to end.",
                inp,
                {
                    "id": r.id,
                    "duration_ms": r.duration_ms,
                    "phash": r.phash,
                    "hook": {
                        "lands_at_ms": r.hook.lands_at_ms,
                        "face_at_ms": r.hook.face_at_ms,
                        "app_at_ms": r.hook.app_at_ms,
                        "hook_type": r.hook.hook_type,
                    },
                    "tags": {
                        "format_id": r.tags.format_id,
                        "hook_type": r.tags.hook_type,
                        "time_to_app_reveal_ms": r.tags.time_to_app_reveal_ms,
                        "cta_type": r.tags.cta_type,
                    },
                    "hook_score": {"band": r.hook_score.band, "points": r.hook_score.points},
                    "flow_score": {"band": r.flow_score.band, "points": r.flow_score.points},
                    "qa": {
                        "verdict": r.qa.verdict if r.qa else None,
                        "suggested_reason_code": r.qa.suggested_reason_code if r.qa else None,
                    },
                    "checks": [{"check": c.check, "result": c.result} for c in r.checks],
                },
            )
        )
    return _suite(
        "video_analysis",
        "The video pipeline on the deterministic fake adapters (scripted scenarios). Pins the whole derivation: observations, scores, tags, QA, hash.",
        "reference",
        cases,
        endpoint="/v1/analyze-video",
        reference="services/ml/src/flowd_ml/video/pipeline.py",
    )


BUILDERS: dict[str, Callable[[], dict[str, Any]]] = {
    "rounding": rounding,
    "bands": bands,
    "hook_score": hook_score,
    "flow_score": flow_score,
    "fraud_compose": fraud_compose,
    "fraud_detect": fraud_detect,
    "match_score": match_score_suite,
    "match_rank": match_rank,
    "price_curve": price_curve_suite,
    "fill_time": fill_time_suite,
    "suggest_cpm": suggest_cpm_suite,
    "funding": funding_suite,
    "first_bounty_funding": first_bounty_suite,
    "all_in_cpm": all_in_cpm_suite,
    "expected_earnings": expected_earnings_suite,
    "phash": phash_suite,
    "qa": qa_suite,
    "beats": beats_suite,
    "hook_type": hook_type_suite,
    "fatigue": fatigue_suite,
    "calibration": calibration_suite,
    "video_analysis": video_analysis_suite,
}


def build_all() -> dict[str, dict[str, Any]]:
    return {name: _json_safe(fn()) for name, fn in BUILDERS.items()}


def render(suite: dict[str, Any]) -> str:
    """Stable text form: sorted nowhere (insertion order is part of the file), 2-space indent, trailing newline."""
    return json.dumps(suite, indent=2, ensure_ascii=False) + "\n"


def readme_text(suites: dict[str, dict[str, Any]]) -> str:
    required = [n for n, s in suites.items() if s["parity"] == "required"]
    reference = [n for n, s in suites.items() if s["parity"] != "required"]
    rows = "\n".join(
        f"| `{n}.json` | {s['parity']} | {len(s['cases'])} | {s.get('endpoint') or s.get('function') or ''} |"
        for n, s in suites.items()
    )
    return f"""# ML golden vectors

Generated by `services/ml/scripts/export_vectors.py` from the Python ML service. **Do not edit by hand**: re-run the script (the
service's tests fail when these files drift from the code).

These cases are for parity-testing the **TypeScript engine** (`apps/web/src/lib/engine`, Vitest) and the **Swift engine**
(`Core/Engine`, XCTest) against the same numbers the service computes, so a creator sees the same Hook Score on the web, on the
phone and in the review queue.

## Format

```json
{{
  "schema": "flowd.testvectors/1",
  "suite": "hook_score",
  "parity": "required",
  "endpoint": "/v1/hook-score",
  "function": "scoreHook(obs)",
  "compare": {{ "objects": "subset", "arrays": "same length, element-wise subset", "numbers": "exact", "null": "must be null" }},
  "cases": [ {{ "id": "perfect", "description": "...", "in": {{ }}, "out": {{ }} }} ]
}}
```

* `in` is the input: a request body for `endpoint`, or the arguments of `function` (`{{"fn": ..., "args": [...]}}` for the small helper suites).
* `out` is the **minimum** an implementation must reproduce. Every key in `out` must equal the implementation's value; extra keys in the
  implementation are fine. Arrays must have the same length and match element-wise. Numbers compare exactly (they are already rounded
  as the contract rounds them). `null` means null.
* Same shape as `packages/contract/formula-vectors.json` (`in` / `out`), so one harness can load both.

## Rounding (the one thing that goes wrong)

The contract is defined in JavaScript. `Math.round` rounds half **up** (toward +infinity), `toFixed` rounds half away from zero on
the exact binary value, and rates use integer basis points. Python's `round` and Swift's `.toNearestOrEven` are banker's rounding and
are WRONG here. `rounding.json` pins the edge cases (`1 of 2 beats = 12.5 -> 13`, `Hook 35 x 0.3 = 10.5 -> 11`, `24.5 s prints "25s"`).

## Suites

| File | Parity | Cases | Endpoint / function |
|---|---|---|---|
{rows}

`required` ({", ".join(required)}) are pure formulas: both engines must reproduce them. `reference` ({", ".join(reference)})
pin the Python service's behaviour (text rules, detector severities, explanations); port them only if an engine implements that feature.

## Perceptual hash

`phash.json` carries its images inline (base64 8-bit grayscale, row-major). Algorithm: grayscale -> 32x32 area average with fractional
box weights -> unnormalised 2D DCT-II of the 32x32 block -> keep the 8x8 low band -> bit = coefficient > median of the 64 coefficients
+ 1e-6 (row-major, MSB first) -> 16 lowercase hex characters. A video hash is the bitwise majority across keyframe hashes (ties vote 0).
Videos within Hamming distance 6 are duplicates.

## Checking the files against the contract

`services/ml/tests/test_contract_parity.py` runs the `required` suites against the contract's JavaScript reference
(`packages/contract/schema/formulas.mjs`) with node, so these vectors are verified against the executable spec and not only against
the Python port.
"""


def write_all(out_dir: str | Path | None = None) -> list[Path]:
    out = Path(out_dir) if out_dir else DEFAULT_OUT
    out.mkdir(parents=True, exist_ok=True)
    suites = build_all()
    written: list[Path] = []
    for name, suite in suites.items():
        p = out / f"{name}.json"
        p.write_text(render(suite), encoding="utf-8", newline="\n")
        written.append(p)
    readme = out / "README.md"
    readme.write_text(readme_text(suites), encoding="utf-8", newline="\n")
    written.append(readme)
    return written
