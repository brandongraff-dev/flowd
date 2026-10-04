"""The video understanding pipeline on the deterministic fake adapters."""

from __future__ import annotations

import pytest

from flowd_ml.schemas.common import OnScreenText, SceneCut, TranscriptSegment
from flowd_ml.schemas.video import AnalyzeVideoRequest
from flowd_ml.video.adapters.base import AdapterSet, FrameFacts, OcrLine, VideoRef
from flowd_ml.video.adapters.fake import fake_adapters
from flowd_ml.video.observe import (
    audio_gap_count,
    build_scenes,
    count_ctas,
    disclosure_presence,
    first_sentence,
    frame_times,
    merge_on_screen_text,
    observe_hook,
    primary_cta,
)
from flowd_ml.video.pipeline import PipelineError, VideoPipeline, analysis_id
from flowd_ml.video.scenarios import SCENARIOS, pick
from flowd_ml.video.tagging import infer_format_id
from helpers import assert_subset, load_vectors

BRIEF = {
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
CLOCK = "2026-10-03T14:00:00Z"


@pytest.fixture(scope="module")
def pipeline() -> VideoPipeline:
    return VideoPipeline(fake_adapters(), lambda: CLOCK)


def analyse(pipeline: VideoPipeline, scenario: str, seed: int = 412, **over):
    body = {
        "submission_id": "sub_0412",
        "version": 1,
        "video": {"uri": f"fake://{scenario}?seed={seed}"},
        "brief": BRIEF,
        "creator_median_views": 14_200,
        **over,
    }
    return pipeline.analyze(AnalyzeVideoRequest.model_validate(body))


@pytest.mark.parametrize("case", load_vectors("video_analysis")["cases"], ids=lambda c: c["id"])
def test_video_analysis_vectors(pipeline: VideoPipeline, case: dict) -> None:
    r = pipeline.analyze(AnalyzeVideoRequest.model_validate(case["in"]))
    got = {
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
    }
    assert_subset(case["out"], got)


def test_a_strong_video_end_to_end(pipeline: VideoPipeline) -> None:
    r = analyse(pipeline, "strong_screen_reaction")
    assert r.id == "va_0412_v1"
    assert r.stage == "fake"
    assert r.analysed_at == CLOCK
    assert (r.hook_score.points, r.hook_score.band, r.flow_score.points, r.flow_score.band) == (100, "A", 100, "A")
    assert r.hook.text == "I was wrong about AI photo apps."
    assert r.hook.hook_type == "confession"
    assert r.hook.spoken_matches_onscreen
    assert (r.hook.lands_at_ms, r.hook.app_at_ms, r.hook.caption_at_ms) == (
        300,
        1200,
        500,
    )  # visual events resolve to the 500 ms frame grid; speech to the word
    assert r.tags.format_id == "tmpl_screen_reaction"
    assert r.tags.cta_type == "link_in_bio"
    assert r.tags.time_to_app_reveal_ms == 1200
    assert r.tags.hook_words == "I was wrong about AI photo"
    assert r.qa is not None
    assert r.qa.verdict == "pass"
    assert r.qa.auto_approvable
    assert len(r.checks) == 14
    assert not r.qa.skipped
    assert r.duplicate_of_submission_id is None
    assert len(r.phash) == 16
    assert r.reasons[0].severity == "positive"
    assert r.fixes == []
    assert r.hook_score.label == r.flow_score.label == "Checklist score. It gets smarter as bounties settle."
    assert r.predicted is not None
    assert r.predicted.predicted_views == 22_720
    assert r.summary == "Hook Score A (100), Flow Score A (100). QA: pass."


def test_contract_shape_fields_are_present_and_consistent(pipeline: VideoPipeline) -> None:
    r = analyse(pipeline, "strong_screen_reaction")
    assert r.transcript_text == " ".join(s.text for s in r.transcript)
    assert r.language == "en"
    assert r.duration_ms == 24_000
    assert [b.beat for b in r.beats] == ["hook", "app_reveal", "demo", "cta"]
    assert all(b.found for b in r.beats)
    assert {c.check for c in r.checks} == set(
        __import__("flowd_ml.constants", fromlist=["ENUM_QA_CHECKS"]).ENUM_QA_CHECKS
    )
    assert all(isinstance(s, SceneCut) for s in r.scenes)
    assert r.scenes[0].t_start_ms == 0
    assert all(isinstance(t, OnScreenText) for t in r.on_screen_text)
    assert all(t.t_end_ms >= t.t_start_ms for t in r.on_screen_text)
    assert [s.t_start_ms for s in r.transcript] == sorted(s.t_start_ms for s in r.transcript)
    assert set(r.adapters) == {"prober", "transcriber", "scene_detector", "vlm", "frames", "audio", "embedder"}
    assert all(v.startswith("fake-") for v in r.adapters.values())
    assert r.embedding.model == "fake-hashing-embedder"
    assert r.embedding.dim == 256
    assert r.embedding.vector is None
    assert set(r.timings_ms) >= {"probe", "transcribe", "scenes", "frames", "thumbnails", "audio", "embed"}
    assert any("fake adapters" in w for w in r.warnings)


def test_the_same_input_always_gives_the_same_analysis(pipeline: VideoPipeline) -> None:
    a = analyse(pipeline, "slow_hook_no_disclosure").model_dump(mode="json", exclude={"timings_ms"})
    b = analyse(pipeline, "slow_hook_no_disclosure").model_dump(mode="json", exclude={"timings_ms"})
    assert a == b


def test_a_slow_unlabelled_video_is_explained_and_blocked(pipeline: VideoPipeline) -> None:
    r = analyse(pipeline, "slow_hook_no_disclosure")
    assert r.hook.lands_at_ms == 3400
    assert r.hook.hook_type == "pattern_interrupt"
    assert r.hook.app_at_ms == 8800
    assert (r.hook_score.band, r.flow_score.band) == ("E", "E")
    assert r.qa is not None
    assert r.qa.verdict == "fail"
    assert r.qa.blocks_settlement
    assert r.qa.suggested_reason_code == "missing_disclosure"
    codes = [x.code for x in r.reasons]
    assert codes[0] in ("disclosure_audio", "disclosure_onscreen")  # compliance first
    assert {"hook_lands_2s", "app_visible_3s", "disclosure"} <= set(codes)
    assert any("paid partnership" in f.text for f in r.fixes)
    assert not r.flow_features.single_cta  # download + link in bio + code is three calls to action
    assert r.flow_features.audio_gaps == 2
    assert r.tags.format_id is None
    assert r.tags.cta_type == "link_in_bio"  # the first mechanism in the fixed priority order


@pytest.mark.parametrize(
    ("scenario", "check", "result", "reason"),
    [
        ("banned_claim", "banned_claims", "fail", "banned_claim"),
        ("ai_unlabelled", "ai_content", "fail", "ai_content_undisclosed"),
        ("ai_unlabelled", "music_licence", "fail", "music_not_licensed"),
        ("watermark_competitor", "watermark", "fail", "competitor_shown"),
        ("long_landscape", "aspect_ratio", "fail", "wrong_format"),
        ("long_landscape", "audio_clarity", "fail", "audio_unclear"),
        ("unsafe_content", "moderation", "fail", "brand_safety"),
        ("faceless_slideshow", "disclosure_audio", "warn", "missing_disclosure"),
    ],
)
def test_each_scripted_problem_is_caught_by_the_right_check(
    pipeline: VideoPipeline, scenario: str, check: str, result: str, reason: str
) -> None:
    r = analyse(pipeline, scenario)
    c = next(c for c in r.checks if c.check == check)
    assert (c.result, c.reason_code) == (result, reason)


def test_a_faceless_slideshow_is_scored_as_faceless(pipeline: VideoPipeline) -> None:
    r = analyse(pipeline, "faceless_slideshow")
    assert r.tags.format_id == "tmpl_faceless_slideshow"
    assert r.hook_features.faceless
    assert r.hook.face_at_ms is None
    face = next(i for i in r.hook_score.items if i.id == "face_early")
    assert face.points == 15
    assert face.reason == "Faceless format: no face needed."


def test_same_seed_means_same_footage_and_flags_the_duplicate(pipeline: VideoPipeline) -> None:
    first = analyse(pipeline, "strong_screen_reaction", seed=77)
    other = analyse(pipeline, "slow_hook_no_disclosure", seed=78)
    assert first.phash != other.phash
    again = analyse(
        pipeline,
        "strong_screen_reaction",
        seed=77,
        submission_id="sub_0500",
        known_hashes=[
            {"id": "sub_0412", "phash": first.phash, "creator_id": "cr_other"},
            {"id": "sub_0413", "phash": other.phash},
        ],
    )
    assert again.phash == first.phash
    assert again.duplicate_of_submission_id == "sub_0412"
    dup = next(c for c in again.checks if c.check == "duplicate")
    assert dup.result == "fail"
    assert dup.reason_code == "unoriginal_clip"
    assert again.qa is not None
    assert again.qa.verdict == "fail"
    assert "duplicate of sub_0412" in again.summary


def test_an_unrecognised_uri_gets_a_stable_everyday_scenario(pipeline: VideoPipeline) -> None:
    a = pipeline.analyze(AnalyzeVideoRequest.model_validate({"video": {"uri": "s3://flowd/raw/abc.mp4"}}))
    b = pipeline.analyze(AnalyzeVideoRequest.model_validate({"video": {"uri": "s3://flowd/raw/abc.mp4"}}))
    assert a.phash == b.phash
    assert a.id.startswith("va_x")
    assert a.id.endswith("_v1")
    assert pick("s3://flowd/raw/abc.mp4")[0].name in {
        "strong_screen_reaction",
        "slow_hook_no_disclosure",
        "faceless_slideshow",
    }
    assert pick("fake://banned_claim?seed=5")[0].name == "banned_claim"
    assert pick("fake://banned_claim?seed=5")[1] == 5
    assert set(SCENARIOS) == {
        "strong_screen_reaction",
        "slow_hook_no_disclosure",
        "banned_claim",
        "ai_unlabelled",
        "watermark_competitor",
        "faceless_slideshow",
        "long_landscape",
        "unsafe_content",
    }


def test_without_a_brief_the_default_beats_are_not_required(pipeline: VideoPipeline) -> None:
    r = pipeline.analyze(AnalyzeVideoRequest.model_validate({"video": {"uri": "fake://strong_screen_reaction"}}))
    assert [b.beat for b in r.beats] == ["hook", "app_reveal", "demo", "payoff", "cta"]
    assert not any(b.required for b in r.beats)
    assert next(i for i in r.flow_score.items if i.id == "required_beats").points == 25  # no required beats: full marks
    assert r.qa is not None
    assert "brief_beats" in r.qa.skipped


def test_options_control_frames_embedding_and_qa(pipeline: VideoPipeline) -> None:
    r = analyse(
        pipeline,
        "strong_screen_reaction",
        options={"include_embedding": True, "run_qa": False, "frame_interval_ms": 1000, "max_frames": 10},
    )
    assert r.embedding.vector is not None
    assert len(r.embedding.vector) == 256
    assert r.checks == []
    assert r.qa is None
    assert any("QA was skipped" in w for w in r.warnings)
    assert "QA:" not in r.summary


def test_request_overrides_win_over_the_probe(pipeline: VideoPipeline) -> None:
    r = pipeline.analyze(
        AnalyzeVideoRequest.model_validate(
            {
                "video": {"uri": "fake://strong_screen_reaction", "duration_ms": 31_000, "width": 1920, "height": 1080},
                "brief": BRIEF,
            }
        )
    )
    assert r.duration_ms == 31_000
    assert next(c for c in r.checks if c.check == "aspect_ratio").result == "fail"


def test_adapter_failure_names_the_failing_stage() -> None:
    class Boom:
        name = "fake-whisper"

        def transcribe(self, video: VideoRef):
            raise RuntimeError("gpu out of memory")

    adapters = fake_adapters()
    broken = AdapterSet(
        adapters.prober,
        Boom(),
        adapters.scene_detector,
        adapters.vlm,
        adapters.frames,
        adapters.audio,
        adapters.embedder,
    )
    with pytest.raises(PipelineError) as exc:
        VideoPipeline(broken).analyze(
            AnalyzeVideoRequest.model_validate({"video": {"uri": "fake://strong_screen_reaction"}})
        )
    assert exc.value.stage == "transcribe"
    assert "gpu out of memory" in str(exc.value)


def test_a_mixed_adapter_set_is_reported_as_real() -> None:
    adapters = fake_adapters()

    class Real:
        name = "faster-whisper-large-v3"

        def transcribe(self, video: VideoRef):
            return adapters.transcriber.transcribe(video)

    mixed = AdapterSet(
        adapters.prober,
        Real(),
        adapters.scene_detector,
        adapters.vlm,
        adapters.frames,
        adapters.audio,
        adapters.embedder,
    )
    p = VideoPipeline(mixed)
    assert p.stage == "real"
    r = p.analyze(AnalyzeVideoRequest.model_validate({"video": {"uri": "fake://strong_screen_reaction"}}))
    assert not any("fake adapters" in w for w in r.warnings)


def test_analysis_ids_follow_the_contract_format() -> None:
    assert analysis_id("sub_0412", 2, "x") == "va_0412_v2"
    assert analysis_id("0412", 1, "x") == "va_0412_v1"
    assert analysis_id(None, 3, "u").startswith("va_x")
    assert analysis_id(None, 3, "u") == analysis_id(None, 3, "u")


# ── observation helpers ─────────────────────────────────────────────────────────────────────────
def test_frame_times_are_dense_in_the_hook_then_sparse() -> None:
    t = frame_times(24_000)
    assert t[:13] == [*range(0, 6000, 500), 6000]
    assert t[13] == 8000
    assert t[-1] <= 24_000
    assert len(frame_times(24_000, max_frames=5)) == 5
    assert frame_times(2_000) == [0, 500, 1000, 1500]
    assert frame_times(0) == [0]


def test_on_screen_text_is_merged_across_frames_and_tracks_safe_zones() -> None:
    frames = [
        FrameFacts(t_ms=0, text=(OcrLine("Hello", True),)),
        FrameFacts(t_ms=500, text=(OcrLine("hello", True), OcrLine("Buy now", False))),
        FrameFacts(t_ms=1000, text=(OcrLine("Buy now", True),)),
        FrameFacts(t_ms=1500, text=()),
        FrameFacts(t_ms=2000, text=(OcrLine("Hello", True),)),
    ]
    items = merge_on_screen_text(frames, 3000)
    by = {(o.text, o.t_start_ms): o for o in items}
    assert by[("Hello", 0)].t_end_ms == 1000
    assert by[("Hello", 0)].in_safe_zone
    assert by[("Buy now", 500)].t_end_ms == 1500
    assert not by[("Buy now", 500)].in_safe_zone  # unsafe in any frame makes it unsafe
    assert by[("Hello", 2000)].t_end_ms == 2500  # still showing at the last frame: one more sampling step
    assert merge_on_screen_text([], 1000) == []


def test_scenes_take_the_majority_kind_of_their_frames() -> None:
    frames = [
        FrameFacts(t_ms=t, scene_kind=k)
        for t, k in [
            (0, "face"),
            (500, "face"),
            (1000, "screen_recording"),
            (1500, "screen_recording"),
            (2000, "screen_recording"),
        ]
    ]
    scenes = build_scenes([(0, 1000), (1000, 2500)], frames, 2500)
    assert [(s.t_start_ms, s.kind) for s in scenes] == [(0, "face"), (1000, "screen_recording")]
    assert build_scenes([], frames, 2500)[0].t_end_ms == 2500
    assert build_scenes([(0, 400), (400, 900)], [], 900)[1].kind == "broll"


def test_hook_observation_skips_greetings_and_flags_late_hooks() -> None:
    segs = [
        TranscriptSegment(t_start_ms=0, t_end_ms=2400, text="Hey guys, welcome back."),
        TranscriptSegment(t_start_ms=3400, t_end_ms=6000, text="I was wrong about budgeting apps. Here is why."),
    ]
    o = observe_hook(segs, [], [], [], None)
    assert o.features.lands_ms == 3400
    assert o.features.speech_ms == 0
    assert o.text == "I was wrong about budgeting apps."
    assert o.hook_type == "confession"
    none = observe_hook([TranscriptSegment(t_start_ms=9000, t_end_ms=9500, text="Late line.")], [], [], [], None)
    assert none.features.lands_ms is None  # nothing inside the 8 s window counts as the hook
    assert observe_hook([], [], [], [], None).features.speech_ms is None


def test_cta_counting_treats_try_free_as_the_offer_not_a_second_action() -> None:
    segs = [TranscriptSegment(t_start_ms=0, t_end_ms=1, text="Try it free for seven days. Link in bio.")]
    assert count_ctas(segs, []) == (1, ["link_in_bio", "try_free"])
    assert count_ctas([TranscriptSegment(t_start_ms=0, t_end_ms=1, text="Try it free.")], [])[0] == 1
    assert (
        count_ctas(
            [TranscriptSegment(t_start_ms=0, t_end_ms=1, text="Link in bio. Use code GLOW10. Download it now.")], []
        )[0]
        == 3
    )
    assert count_ctas([], []) == (0, [])
    assert primary_cta(["try_free", "use_code"]) == "use_code"
    assert primary_cta([]) is None


def test_disclosure_gaps_and_sentences() -> None:
    segs = [TranscriptSegment(t_start_ms=0, t_end_ms=1, text="This is a paid partnership.")]
    shown = [OnScreenText(t_start_ms=0, t_end_ms=1, text="#ad")]
    assert disclosure_presence(segs, shown) == (True, True)
    assert disclosure_presence([], []) == (False, False)
    from flowd_ml.video.adapters.base import AudioFacts

    assert audio_gap_count(AudioFacts(dead_air_gaps_ms=(500, 1000, 1001, 2500))) == 2
    assert first_sentence("Why? Because. More.") == "Why?"
    assert first_sentence("no punctuation here") == "no punctuation here"
    assert len(first_sentence("x" * 300)) == 140


def test_format_inference_is_conservative() -> None:
    def scenes(*kinds: str) -> list[SceneCut]:
        return [SceneCut(t_start_ms=i * 1000, t_end_ms=(i + 1) * 1000, kind=k) for i, k in enumerate(kinds)]  # type: ignore[arg-type]

    seg = lambda text: [TranscriptSegment(t_start_ms=0, t_end_ms=1, text=text)]  # noqa: E731
    assert infer_format_id(scenes("slide", "slide"), seg("hi"), [], None, False) == "tmpl_faceless_slideshow"
    assert infer_format_id(scenes("slide", "slide"), seg("hi"), [], None, True) == "tmpl_carousel_video"
    assert (
        infer_format_id(scenes("face"), seg("Replying to a comment from Sam"), [], None, True) == "tmpl_reply_comment"
    )
    assert infer_format_id(scenes("face"), seg("Day 30 of using this app"), [], None, True) == "tmpl_results_update"
    assert infer_format_id(scenes("face"), seg("I became someone who sleeps"), [], None, True) == "tmpl_identity_shift"
    assert infer_format_id(scenes("face"), seg("This app is so slept on"), [], None, True) == "tmpl_hidden_gem"
    assert infer_format_id(scenes("face"), seg("Nothing to see"), [], None, True) is None
