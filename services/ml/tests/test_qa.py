"""Auto-QA: 14 checks, verdicts, reason codes, evidence, explanations."""

from __future__ import annotations

import copy

import pytest

from flowd_ml.constants import ENUM_QA_CHECKS
from flowd_ml.qa import run_qa
from flowd_ml.qa.reasons import REASON_CODES
from flowd_ml.schemas.qa import QaRequest
from flowd_ml.text.normalize import contains_phrase, norm, overlap, tokens
from flowd_ml.text.patterns import (
    cta_types_in,
    has_ai_label,
    has_onscreen_disclosure,
    is_filler,
    spoken_disclosure_span,
)
from helpers import assert_subset, load_vectors

BASE = {
    "media": {"duration_ms": 24_000, "width": 1080, "height": 1920},
    "transcript": [
        {"t_start_ms": 300, "t_end_ms": 2100, "text": "I was wrong about AI photo apps."},
        {"t_start_ms": 2200, "t_end_ms": 4800, "text": "This is a paid partnership with Lumi, and look at this."},
        {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Try it free for seven days, link in bio."},
    ],
    "on_screen_text": [
        {"t_start_ms": 400, "t_end_ms": 2400, "text": "I was wrong about AI photo apps", "in_safe_zone": True},
        {"t_start_ms": 2500, "t_end_ms": 5000, "text": "#ad Paid partnership with Lumi", "in_safe_zone": True},
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


def req(**over: object) -> QaRequest:
    d = copy.deepcopy(BASE)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(d.get(k), dict):
            d[k].update(v)
        else:
            d[k] = v
    return QaRequest.model_validate(d)


def result(r, check: str):
    return next(c for c in r.checks if c.check == check)


@pytest.mark.parametrize("case", load_vectors("qa")["cases"], ids=lambda c: c["id"])
def test_qa_replays_every_golden_vector(case: dict) -> None:
    r = run_qa(QaRequest.model_validate(case["in"]))
    got = {
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
    }
    assert_subset(case["out"], got)


def test_clean_video_passes_and_skips_checks_without_input() -> None:
    r = run_qa(req())
    assert r.verdict == "pass"
    assert r.passed
    assert not r.auto_approvable  # six checks had no input, so auto-approve is withheld
    assert set(r.skipped) == {"music_licence", "ai_content", "duplicate", "watermark", "audio_clarity", "moderation"}
    assert {c.check for c in r.checks} | set(r.skipped) == set(ENUM_QA_CHECKS)
    assert r.suggested_reason_code is None
    assert r.fixes == []
    assert r.reasons[-1].severity == "positive"


def test_auto_approvable_needs_every_check_to_run_and_pass() -> None:
    r = run_qa(
        req(
            audio={"music_detected": False, "dead_air_gaps_ms": [], "speech_ratio": 0.8, "loudness_lufs": -16.0},
            vision={"watermarks": [], "ai_generated_probability": 0.01, "moderation": {"sexual": 0.0}},
            phash="bf2183365fb6e014",
            known_hashes=[{"id": "sub_1", "phash": "0000000000000000"}],
        )
    )
    assert r.skipped == []
    assert r.verdict == "pass"
    assert r.auto_approvable


def test_missing_disclosure_blocks_settlement_and_names_the_fix() -> None:
    r = run_qa(
        req(transcript=[{"t_start_ms": 300, "t_end_ms": 2100, "text": "Try it free, link in bio."}], on_screen_text=[])
    )
    assert r.verdict == "fail"
    assert r.blocks_settlement
    assert r.suggested_reason_code == "missing_disclosure"
    audio, onscreen = result(r, "disclosure_audio"), result(r, "disclosure_onscreen")
    assert audio.blocks_settlement
    assert onscreen.blocks_settlement
    assert audio.evidence is not None
    assert audio.evidence.kind == "brief_requirement"
    assert "Lumi" in audio.evidence.ref
    assert "Settlement is blocked" in r.summary
    flag = next(f for f in r.flags if f.check == "disclosure_audio")
    assert flag.creator_copy == REASON_CODES["missing_disclosure"].creator_copy
    assert "paid partnership" in flag.fix


def test_late_or_short_disclosure_warns_without_blocking() -> None:
    late = run_qa(
        req(
            transcript=[
                {"t_start_ms": 300, "t_end_ms": 2100, "text": "Hello there."},
                {"t_start_ms": 20400, "t_end_ms": 23200, "text": "Paid partnership with Lumi."},
            ]
        )
    )
    assert result(late, "disclosure_audio").result == "warn"
    assert not late.blocks_settlement
    short = run_qa(req(on_screen_text=[{"t_start_ms": 2500, "t_end_ms": 3900, "text": "#ad", "in_safe_zone": True}]))
    assert result(short, "disclosure_onscreen").result == "warn"
    tiny = run_qa(req(on_screen_text=[{"t_start_ms": 2500, "t_end_ms": 3000, "text": "#ad", "in_safe_zone": True}]))
    assert result(tiny, "disclosure_onscreen").result == "fail"
    assert tiny.blocks_settlement
    unsafe = run_qa(req(on_screen_text=[{"t_start_ms": 2500, "t_end_ms": 5500, "text": "#ad", "in_safe_zone": False}]))
    assert result(unsafe, "disclosure_onscreen").result == "warn"


def test_banned_claims_fail_with_a_quoted_transcript_line() -> None:
    r = run_qa(
        req(
            transcript=[
                *BASE["transcript"],
                {"t_start_ms": 9000, "t_end_ms": 11000, "text": "Honestly it gives you GUARANTEED results!"},
            ]
        )
    )
    c = result(r, "banned_claims")
    assert c.result == "fail"
    assert c.reason_code == "banned_claim"
    assert c.evidence is not None
    assert c.evidence.kind == "transcript"
    assert c.evidence.t_ms == 9000
    assert "GUARANTEED" in (c.evidence.excerpt or "")
    assert "00:09" in c.message
    on_screen = run_qa(
        req(
            on_screen_text=[
                *BASE["on_screen_text"],
                {"t_start_ms": 7000, "t_end_ms": 9000, "text": "Guaranteed results", "in_safe_zone": True},
            ]
        )
    )
    assert result(on_screen, "banned_claims").evidence.kind == "timecode"  # type: ignore[union-attr]


def test_platform_risky_claims_only_warn() -> None:
    r = run_qa(
        req(
            transcript=[
                *BASE["transcript"],
                {"t_start_ms": 9000, "t_end_ms": 11000, "text": "This is clinically proven to work."},
            ]
        )
    )
    assert result(r, "banned_claims").result == "warn"
    assert r.verdict == "warn"


@pytest.mark.parametrize(
    ("audio", "policy", "expected"),
    [
        ({"music_detected": False}, "commercial_library", "pass"),
        ({"music_detected": True, "music_licensed": True}, "commercial_library", "pass"),
        ({"music_detected": True, "music_licensed": False}, "commercial_library", "fail"),
        ({"music_detected": True}, "commercial_library", "warn"),
        ({"music_detected": True, "music_licensed": True}, "original_only", "fail"),
    ],
)
def test_music_licence(audio: dict, policy: str, expected: str) -> None:
    r = run_qa(req(audio=audio, brief={"music_policy": policy}))
    assert result(r, "music_licence").result == expected


def test_ai_content_rules() -> None:
    assert result(run_qa(req(vision={"ai_generated_probability": 0.2})), "ai_content").result == "pass"
    assert result(run_qa(req(vision={"ai_generated_probability": 0.55})), "ai_content").result == "warn"
    assert result(run_qa(req(vision={"ai_generated_probability": 0.9})), "ai_content").result == "fail"
    labelled = req(
        vision={"ai_generated_probability": 0.9},
        on_screen_text=[
            {"t_start_ms": 0, "t_end_ms": 3000, "text": "AI-generated", "in_safe_zone": True},
            *BASE["on_screen_text"],
        ],
    )
    assert result(run_qa(labelled), "ai_content").result == "pass"
    forbidden = req(vision={"ai_generated_probability": 0.9}, brief={"ai_policy": "not_allowed"})
    c = result(run_qa(forbidden), "ai_content")
    assert c.result == "fail"
    assert "does not allow" in c.message


def test_duplicate_detection_uses_distance_and_kind() -> None:
    def dup(distance_hash: str, kind: str):
        return result(
            run_qa(req(phash="ffffffffffffffff", known_hashes=[{"id": "sub_9", "phash": distance_hash, "kind": kind}])),
            "duplicate",
        )

    assert dup("ffffffffffffffff", "other_creator").reason_code == "unoriginal_clip"
    assert dup("ffffffffffffffff", "own_earlier").reason_code == "duplicate_content"
    assert dup("ffffffffffffffc0", "other_creator").result == "fail"  # distance 6
    assert dup("ffffffffffffff80", "other_creator").result == "warn"  # distance 7
    assert dup("fffffffffffffc00", "other_creator").result == "warn"  # distance 10: the last warn distance
    assert dup("fffffffffffff800", "other_creator").result == "pass"  # distance 11
    assert result(run_qa(req(phash="ffffffffffffffff", known_hashes=[])), "duplicate").result == "pass"
    # a submission never duplicates itself
    self_only = run_qa(
        req(
            submission_id="sub_9", phash="ffffffffffffffff", known_hashes=[{"id": "sub_9", "phash": "ffffffffffffffff"}]
        )
    )
    assert result(self_only, "duplicate").result == "pass"


def test_watermark_and_competitor_checks() -> None:
    assert result(run_qa(req(vision={"watermarks": ["ClipCut"]})), "watermark").reason_code == "watermark_present"
    assert result(run_qa(req(vision={"competitor_logos": ["PixelPal"]})), "watermark").reason_code == "competitor_shown"
    spoken = req(
        brief={"competitor_names": ["PixelPal"]},
        transcript=[*BASE["transcript"], {"t_start_ms": 8000, "t_end_ms": 9000, "text": "Better than PixelPal."}],
    )
    c = result(run_qa(spoken), "watermark")
    assert c.result == "fail"
    assert c.reason_code == "competitor_shown"
    assert c.evidence is not None
    assert c.evidence.t_ms == 8000
    assert "watermark" in {
        c.check for c in run_qa(req(brief={"competitor_names": ["PixelPal"]})).checks
    }  # competitor list alone is enough input
    assert "watermark" in run_qa(req()).skipped


def test_brief_beats_coverage_and_codes() -> None:
    offer = req(
        brief={"beats": [{"beat": "hook"}, {"beat": "app_reveal"}, {"beat": "offer", "label": "State the free trial"}]},
        transcript=[BASE["transcript"][0], BASE["transcript"][1]],
    )
    c = result(run_qa(offer), "brief_beats")  # 2 of 3 found: coverage 0.67 is a warning, not a failure
    assert c.result == "warn"
    assert c.reason_code == "offer_not_stated"
    assert c.evidence is not None
    assert c.evidence.kind == "brief_requirement"
    assert c.evidence.ref == "State the free trial"
    many = req(
        brief={"beats": [{"beat": b} for b in ("proof", "offer", "demo", "win_state")]},
        transcript=[BASE["transcript"][0]],
        scenes=[],
    )
    assert result(run_qa(many), "brief_beats").result == "fail"
    late_app = req(
        brief={"beats": [{"beat": "app_reveal"}], "app_name": "Zorp"},
        transcript=[
            {"t_start_ms": 300, "t_end_ms": 2000, "text": "hi"},
            {"t_start_ms": 6000, "t_end_ms": 7000, "text": "This is Zorp, an app."},
        ],
        on_screen_text=BASE["on_screen_text"],
    )
    c2 = result(run_qa(late_app), "brief_beats")
    assert c2.result == "warn"
    assert c2.reason_code == "app_not_shown_early"
    face = req(brief={"beats": [{"beat": "hook"}], "require_face": True}, vision={"face_ms": 6000})
    assert result(run_qa(face), "brief_beats").reason_code == "face_not_shown"
    assert "brief_beats" in run_qa(req(brief={"beats": []})).skipped


def test_format_checks() -> None:
    assert (
        result(run_qa(req(media={"duration_ms": 24_000, "width": 1920, "height": 1080})), "aspect_ratio").result
        == "fail"
    )
    assert (
        result(run_qa(req(media={"duration_ms": 24_000, "width": 1080, "height": 1920})), "aspect_ratio").result
        == "pass"
    )
    sq = req(media={"duration_ms": 24_000, "width": 1080, "height": 1080}, brief={"aspect": "1:1"})
    assert result(run_qa(sq), "aspect_ratio").result == "pass"
    assert result(run_qa(req(media={"duration_ms": 8_000, "width": 1080, "height": 1920})), "length").result == "fail"
    assert result(run_qa(req(media={"duration_ms": 14_000, "width": 1080, "height": 1920})), "length").result == "warn"
    assert (
        result(run_qa(req(media={"duration_ms": 24_000, "width": 540, "height": 960})), "resolution").result == "fail"
    )
    assert (
        "accepted"
        in result(run_qa(req(media={"duration_ms": 24_000, "width": 720, "height": 1280})), "resolution").message
    )
    no_dims = copy.deepcopy(BASE)
    no_dims["media"] = {"duration_ms": 24_000}
    skipped = run_qa(QaRequest.model_validate(no_dims)).skipped
    assert "aspect_ratio" in skipped
    assert "resolution" in skipped


def test_safe_zone_audio_and_moderation() -> None:
    mixed = req(
        on_screen_text=[
            {"t_start_ms": 0, "t_end_ms": 9000, "text": "ok", "in_safe_zone": True},
            {"t_start_ms": 9000, "t_end_ms": 9500, "text": "#ad", "in_safe_zone": False},
        ]
    )
    assert result(run_qa(mixed), "safe_zone").result == "warn"
    assert result(run_qa(req(audio={"dead_air_gaps_ms": [1500]})), "audio_clarity").result == "warn"
    assert result(run_qa(req(audio={"dead_air_gaps_ms": [1500, 1200, 1100]})), "audio_clarity").result == "fail"
    assert result(run_qa(req(audio={"clipping": True})), "audio_clarity").result == "fail"
    assert result(run_qa(req(audio={"loudness_lufs": -40.0})), "audio_clarity").result == "warn"
    assert result(run_qa(req(audio={"dead_air_gaps_ms": []})), "audio_clarity").result == "pass"
    assert result(run_qa(req(vision={"moderation": {"hate": 0.6}})), "moderation").result == "warn"
    assert result(run_qa(req(vision={"moderation": {"hate": 0.9}})), "moderation").result == "fail"


def test_requesting_a_subset_of_checks() -> None:
    r = run_qa(req(checks=["length", "aspect_ratio"]))
    assert [c.check for c in r.checks] == ["aspect_ratio", "length"]
    assert r.skipped == []  # unrequested checks are not "skipped for lack of input"


def test_every_flag_carries_reason_code_evidence_fix_and_reasons_are_ordered() -> None:
    r = run_qa(
        req(
            transcript=[{"t_start_ms": 300, "t_end_ms": 2100, "text": "guaranteed results"}],
            on_screen_text=[],
            media={"duration_ms": 24_000, "width": 1920, "height": 1080},
        )
    )
    assert r.verdict == "fail"
    assert len(r.flags) >= 3
    for f in r.flags:
        assert f.reason_code in REASON_CODES
        assert f.fix
        assert f.creator_copy
        assert f.label
    assert r.reasons[0].severity == "critical"
    sev = [x.severity for x in r.reasons]
    assert sev == sorted(sev, key=lambda s: {"critical": 0, "warning": 1, "info": 2, "positive": 3}[s])
    assert {f.target for f in r.fixes} == {f.check for f in r.flags}
    assert r.suggested_reason_code == "missing_disclosure"  # disclosure leads the priority order


def test_reason_codes_match_the_contract_table() -> None:
    assert len(REASON_CODES) == 21
    assert {m.applies_to for m in REASON_CODES.values()} == {"both", "reject", "admin"}
    assert REASON_CODES["missing_disclosure"].qa_check == "disclosure_audio"
    assert REASON_CODES["suspected_fraud"].applies_to == "admin"
    for m in REASON_CODES.values():
        assert m.label
        assert m.creator_copy.endswith((".", "!"))
        assert m.fix_hint


def test_qa_request_validation() -> None:
    with pytest.raises(ValueError, match="phash"):
        QaRequest.model_validate({**BASE, "phash": "xyz"})
    with pytest.raises(ValueError, match="checks"):
        QaRequest.model_validate({**BASE, "checks": ["nope"]})
    with pytest.raises(ValueError, match="surprise"):
        QaRequest.model_validate({**BASE, "surprise": 1})


# ── text helpers ────────────────────────────────────────────────────────────────────────────────
def test_text_normalisation_and_phrase_matching() -> None:
    assert norm("  Don’t  PANIC — ok ") == "don't panic - ok"
    assert tokens("Try it free, 7 days!", drop_stop=True) == ["try", "free", "7", "days"]
    assert contains_phrase("It gives GUARANTEED results.", "guaranteed results")
    assert contains_phrase("lose 10 lbs in a week", "lose 10 lbs")
    assert not contains_phrase("unguaranteed resultsets", "guaranteed results")
    assert contains_phrase("get-rich schemes", "get rich")
    assert overlap("photo app", "this photo app is great") == 1.0
    assert overlap("", "x") == 0.0


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("this is a paid partnership with Lumi", True),
        ("hashtag ad", True),
        ("#ad", True),
        ("sponsored by Lumi", True),
        ("partnered with Lumi", True),
        ("this is an ad", True),
        ("no ads here", False),
        ("ad-free forever", False),
        ("I added a filter", False),
        ("download the app", False),
    ],
)
def test_spoken_disclosure_patterns(text: str, expected: bool) -> None:
    assert (spoken_disclosure_span(text) is not None) is expected


def test_onscreen_disclosure_ai_label_cta_and_filler_patterns() -> None:
    assert has_onscreen_disclosure("#ad Paid partnership")
    assert has_onscreen_disclosure("AD")
    assert has_onscreen_disclosure("#sponsored")
    assert not has_onscreen_disclosure("Add to cart")
    assert not has_onscreen_disclosure("nothing here")
    assert has_ai_label("AI-generated")
    assert has_ai_label("made with AI")
    assert not has_ai_label("main idea")
    assert cta_types_in("Link in bio, use code GLOW10. Try it free!") == ["link_in_bio", "use_code", "try_free"]
    assert cta_types_in("just a normal sentence") == []
    assert is_filler("Hey guys, welcome back to my channel.")
    assert is_filler("um")
    assert is_filler("")
    assert not is_filler("I was wrong about AI photo apps.")
