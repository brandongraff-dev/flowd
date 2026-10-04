"""Hook Score and Flow Score: checklist parity, explanations, fixes, validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from flowd_ml.constants import CHECKLIST_LABEL, FLOW_CHECKLIST, HOOK_CHECKLIST
from flowd_ml.schemas.scores import FlowScoreRequest, HookScoreRequest
from flowd_ml.scoring import score_flow, score_hook
from flowd_ml.scoring.bands import band_for, next_band, predicted_views
from flowd_ml.scoring.core import FlowObs, HookObs, grade, score_flow_raw, score_hook_raw
from flowd_ml.scoring.hook_types import above_median_types, classify_hook_text, resolve_hook_type
from helpers import assert_subset, contract_vectors, load_vectors

PERFECT_HOOK = {
    "lands_ms": 800,
    "onscreen_ms": 500,
    "spoken_matches_onscreen": True,
    "face_ms": 300,
    "app_ms": 1500,
    "interrupt_ms": 900,
    "hook_type": "confession",
    "speech_ms": 300,
    "captions_in_safe_zone": True,
}
PERFECT_FLOW = {
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


def test_checklist_weights_sum_to_100() -> None:
    assert sum(i["weight"] for i in HOOK_CHECKLIST) == 100
    assert sum(i["weight"] for i in FLOW_CHECKLIST) == 100


def test_grade_half_is_math_round_of_half_the_weight() -> None:
    assert [grade(False, True, w) for w in (20, 15, 10, 5)] == [10, 8, 5, 3]
    assert grade(True, True, 15) == 15
    assert grade(False, False, 15) == 0


@pytest.mark.parametrize("case", load_vectors("hook_score")["cases"], ids=lambda c: c["id"])
def test_hook_score_replays_every_golden_vector(case: dict) -> None:
    assert_subset(case["out"], score_hook_raw(HookObs(**case["in"])).as_dict())


@pytest.mark.parametrize("case", load_vectors("flow_score")["cases"], ids=lambda c: c["id"])
def test_flow_score_replays_every_golden_vector(case: dict) -> None:
    assert_subset(case["out"], score_flow_raw(FlowObs(**case["in"])).as_dict())


def test_hook_and_flow_match_the_contracts_own_vectors() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("contract vectors not present")
    for c in v["hook_score"]:
        assert_subset(c["out"], score_hook(HookScoreRequest(**c["in"])).model_dump(mode="json"))
    for c in v["flow_score"]:
        assert_subset(c["out"], score_flow(FlowScoreRequest(**c["in"])).model_dump(mode="json"))


def test_perfect_video_scores_100_and_has_no_fixes() -> None:
    r = score_hook(HookScoreRequest(**PERFECT_HOOK))
    assert (r.points, r.band) == (100, "A")
    assert r.fixes == []
    assert r.next_band is None
    assert r.summary.endswith("Every checklist item is earned.")
    assert all(x.severity == "positive" for x in r.reasons)


def test_hook_response_is_explainable_first_class() -> None:
    r = score_hook(HookScoreRequest(lands_ms=3600, face_ms=3100, app_ms=6200, hook_type=None, speech_ms=1700))
    assert r.model.name == "hook-score"
    assert r.model.stage == "heuristic"
    assert r.model.version.startswith("heuristic-")
    assert r.label == CHECKLIST_LABEL
    assert r.band == "E"
    assert r.points == 5
    # reasons: biggest loss first, with timecodes, fully earned last
    assert r.reasons[0].code == "hook_lands_2s"
    assert r.reasons[0].impact == -20
    assert r.reasons[0].t_ms == 3600
    assert r.reasons[0].severity == "critical"
    assert [x.impact for x in r.reasons] == sorted(x.impact for x in r.reasons)
    # personalised fixes carry this video's own numbers and the payoff
    top = r.fixes[0]
    assert top.target == "hook_lands_2s"
    assert top.gain == 20
    assert top.t_ms == 3600
    assert "1.6s" in top.text
    assert "3.6s" in top.text
    assert top.band_after == band_for(5 + 20)
    assert r.best_band_if_all_fixed == "A"
    face = next(f for f in r.fixes if f.target == "face_early")
    assert "3.1s" in face.text
    # items keep the contract strings and add timecodes
    lands = next(i for i in r.items if i.id == "hook_lands_2s")
    assert (lands.reason, lands.fix, lands.t_ms, lands.target_ms) == (
        "Hook lands at 3.6s.",
        "Open on the hook line; trim the intro.",
        3600,
        2000,
    )


def test_fixes_are_ordered_by_gain_and_band_after_is_monotone_with_gain() -> None:
    r = score_hook(HookScoreRequest(lands_ms=5000, onscreen_ms=None, face_ms=None, app_ms=9000, speech_ms=None))
    gains = [f.gain for f in r.fixes]
    assert gains == sorted(gains, reverse=True)
    assert all(
        f.band_after is not None and f.band_after <= r.band for f in r.fixes
    )  # A < B < ...: a fix never makes the band worse
    assert r.next_band is not None


def test_next_band_points_needed() -> None:
    assert next_band(84) == ("A", 1)
    assert next_band(69) == ("B", 1)
    assert next_band(0) == ("D", 40)
    assert next_band(100) is None


@pytest.mark.parametrize(
    ("points", "band"),
    [(100, "A"), (85, "A"), (84.99, "B"), (70, "B"), (69, "C"), (55, "C"), (54, "D"), (40, "D"), (39, "E"), (0, "E")],
)
def test_band_thresholds(points: float, band: str) -> None:
    assert band_for(points) == band


def test_predicted_views_use_band_multipliers() -> None:
    assert predicted_views(14_200, "B") == 16_330
    assert predicted_views(14_200, "A") == 22_720
    r = score_hook(HookScoreRequest(**PERFECT_HOOK, creator_median_views=14_200))
    assert r.predicted is not None
    assert r.predicted.predicted_views == 22_720
    assert r.predicted.label == "Estimate"
    assert r.predicted.installs_per_1000_views == 1.71
    assert score_hook(HookScoreRequest(**PERFECT_HOOK)).predicted is None


def test_hook_type_is_resolved_from_the_prior_or_from_observed_stats() -> None:
    assert above_median_types() == {"confession", "risk_reversal", "specific_number"}
    assert resolve_hook_type("confession", None, None) == (True, True, "day-one prior")
    assert resolve_hook_type("pov", None, None)[:2] == (True, False)
    assert resolve_hook_type(None, None, None)[:2] == (False, False)
    # explicit booleans always win
    assert resolve_hook_type("pov", True, True) == (True, True, "supplied")
    # observed trial rates override the prior
    stats = {"pov": 0.09, "confession": 0.04, "direct_question": 0.05, "curiosity_gap": 0.06}
    assert above_median_types(stats) == {"pov", "curiosity_gap"}
    r = score_hook(HookScoreRequest(**{**PERFECT_HOOK, "hook_type": "pov"}, hook_type_stats=stats))
    assert next(i for i in r.items if i.id == "proven_hook_type").points == 10
    r2 = score_hook(HookScoreRequest(**{**PERFECT_HOOK, "hook_type": "pov"}))
    assert next(i for i in r2.items if i.id == "proven_hook_type").points == 5
    assert r2.resolved_features.hook_type_known is True
    assert r2.resolved_features.hook_type_above_median is False


def test_few_observed_hook_types_fall_back_to_the_prior() -> None:
    assert above_median_types({"pov": 0.5, "confession": 0.1}) == above_median_types()


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I was wrong about AI photo apps.", "confession"),
        ("POV: you finally found a workout app.", "pov"),
        ("Why is nobody talking about this app?", "direct_question"),
        ("12 minutes a day, 30 days, here's what changed.", "specific_number"),
        ("I didn't pay a cent for the first week.", "risk_reversal"),
        ("Wait until you see what this did to my mornings.", "curiosity_gap"),
        ("And that's when I knew.", "pattern_interrupt"),
        ("This app scans receipts.", None),
        ("", None),
    ],
)
def test_hook_text_classifier(text: str, expected: str | None) -> None:
    assert classify_hook_text(text) == expected


def test_hook_features_reject_bad_input() -> None:
    with pytest.raises(ValidationError):
        HookScoreRequest(lands_ms=-1)
    with pytest.raises(ValidationError):
        HookScoreRequest(lands_ms=1, bogus_field=3)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        HookScoreRequest(hook_type="rant")  # type: ignore[arg-type]


def test_flow_score_accepts_hook_features_and_a_beats_list() -> None:
    req = FlowScoreRequest(
        hook=dict(**PERFECT_HOOK),
        beats=[
            {"beat": "hook", "found": True},
            {"beat": "app_reveal", "found": True},
            {"beat": "offer", "found": False},
            {"beat": "cta", "required": False, "found": False},
        ],
        app_ms=1500,
        disclosure_audio=True,
        disclosure_onscreen=True,
        duration_s=24,
        captions_in_safe_zone=True,
        single_cta=True,
        ends_on_win_state=True,
        audio_gaps=0,
        format_order="in_order",
        creator_median_views=10_000,
    )
    r = score_flow(req)
    assert r.hook_score is not None
    assert r.hook_score.points == 100
    required = next(i for i in r.items if i.id == "required_beats")
    assert required.reason == "2 of 3 required beats found."
    assert required.points == 17  # 25 x 2/3 = 16.67 -> 17
    fix = next(f for f in r.fixes if f.target == "required_beats")
    assert "offer" in fix.text  # names the missing beat
    assert r.resolved["beats_required"] == 3
    assert r.predicted is not None


def test_flow_score_validation_rules() -> None:
    base = {k: v for k, v in PERFECT_FLOW.items() if k not in ("hook_points", "beats_found", "beats_required")}
    with pytest.raises(ValidationError, match="exactly one of hook_points or hook"):
        FlowScoreRequest(**base, beats_found=1, beats_required=1)
    with pytest.raises(ValidationError, match="exactly one of hook_points or hook"):
        FlowScoreRequest(**base, hook_points=1, hook=PERFECT_HOOK, beats_found=1, beats_required=1)
    with pytest.raises(ValidationError, match="give beats"):
        FlowScoreRequest(**base, hook_points=80)
    with pytest.raises(ValidationError, match="not both"):
        FlowScoreRequest(
            **base, hook_points=80, beats=[{"beat": "hook", "found": True}], beats_found=1, beats_required=1
        )
    with pytest.raises(ValidationError):
        FlowScoreRequest(**base, hook_points=101, beats_found=1, beats_required=1)


def test_flow_fixes_are_specific_and_ordered() -> None:
    r = score_flow(
        FlowScoreRequest(
            **{
                **PERFECT_FLOW,
                "disclosure_audio": False,
                "disclosure_onscreen": False,
                "duration_s": 52,
                "audio_gaps": 3,
                "app_ms": 9000,
                "format_id": "tmpl_screen_reaction",
                "format_order": "out_of_order",
            }
        )
    )
    by_target = {f.target: f for f in r.fixes}
    assert "paid partnership" in by_target["disclosure"].text
    assert "2 seconds" in by_target["disclosure"].text
    assert "52s" in by_target["length_ok"].text
    assert "30" in by_target["length_ok"].text
    assert "3 silence" in by_target["audio_clear"].text
    assert "9.0s" in by_target["app_visible_early"].text
    assert "hook > app reveal" in by_target["format_fit"].text
    assert [f.gain for f in r.fixes] == sorted((f.gain for f in r.fixes), reverse=True)
    assert r.reasons[0].severity in ("critical", "warning")
    assert "Fixing all" in r.summary or r.band == "A"
