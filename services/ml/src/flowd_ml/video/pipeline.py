"""Video understanding orchestrator (BLUEPRINT ML system 1): one upload in, one ``VideoAnalysis`` out.

transcribe -> detect scenes -> sample frames -> describe frames -> analyse audio -> hash -> embed -> derive observations ->
auto-QA -> Hook Score -> Flow Score -> tags. The pipeline owns no model: every stage goes through an adapter, so the same
code runs on the fake adapters (tests, dev, CI) and on the GPU worker's real ones.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Literal, TypeVar

from ..constants import ENUM_BEAT_IDS
from ..phash.core import video_phash
from ..phash.index import closest_match
from ..qa.beats import BeatContext, detect_beats, infer_format_order, locate_beat
from ..qa.engine import run_qa
from ..schemas.common import BeatHit, Fix, ModelInfo, Reason, ScoreCard
from ..schemas.qa import BriefBeatIn, QaAudio, QaBrief, QaCheckOut, QaMedia, QaRequest, QaResponse, QaVision
from ..schemas.scores import FlowFeatures, FlowScoreRequest, FlowScoreResponse, HookScoreRequest, HookScoreResponse
from ..schemas.video import (
    AnalyzeVideoRequest,
    AnalyzeVideoResponse,
    EmbeddingInfo,
    HookAnalysis,
    QaSummary,
    VideoTags,
)
from ..scoring.flow import score_flow
from ..scoring.hook import score_hook
from ..version import MODEL_VERSIONS
from .adapters.base import AdapterSet, FrameFacts, VideoRef, VlmContext
from .observe import (
    audio_gap_count,
    build_scenes,
    count_ctas,
    disclosure_presence,
    frame_times,
    merge_on_screen_text,
    observe_hook,
    primary_cta,
)
from .tagging import infer_format_id

MODEL = ModelInfo(name="analyze-video", kind="video_understanding", version=MODEL_VERSIONS["video"], stage="heuristic")
DEFAULT_BEATS = ("hook", "app_reveal", "demo", "payoff", "cta")
KEYFRAMES = 8
T = TypeVar("T")


class PipelineError(RuntimeError):
    """An adapter failed. ``stage`` names the pipeline step so the caller can retry the right thing."""

    def __init__(self, stage: str, message: str) -> None:
        super().__init__(f"{stage}: {message}")
        self.stage = stage


def utc_now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def analysis_id(submission_id: str | None, version: int, uri: str) -> str:
    """``va_<submission number>_v<version>`` (the contract's id format)."""
    if submission_id:
        number = submission_id.split("_", 1)[1] if "_" in submission_id else submission_id
    else:
        number = "x" + hashlib.sha1(uri.encode("utf-8"), usedforsecurity=False).hexdigest()[:8]
    return f"va_{number}_v{version}"


def _locate_hit(beat: str, ctx: BeatContext) -> BeatHit:
    t = locate_beat(beat, ctx)
    return BeatHit(beat=beat, required=False, found=t is not None, t_ms=t)  # type: ignore[arg-type]


def _aggregate_vision(frames: Sequence[FrameFacts], face_ms: int | None) -> QaVision:
    watermarks = sorted({w for f in frames for w in f.watermarks})
    competitors = sorted({c for f in frames for c in f.competitor_logos})
    probs = [f.ai_generated_probability for f in frames if f.ai_generated_probability is not None]
    moderation: dict[str, float] = {}
    for f in frames:
        for k, v in f.moderation.items():
            moderation[k] = max(moderation.get(k, 0.0), v)
    return QaVision(
        watermarks=watermarks,
        competitor_logos=competitors,
        ai_generated_probability=max(probs) if probs else None,
        moderation=moderation or None,
        face_ms=face_ms,
    )


class VideoPipeline:
    def __init__(self, adapters: AdapterSet, clock: Callable[[], str] = utc_now_iso) -> None:
        self.adapters = adapters
        self.clock = clock

    @property
    def stage(self) -> Literal["fake", "real"]:
        return "fake" if all(n.startswith("fake-") for n in self.adapters.names().values()) else "real"

    @staticmethod
    def _timed(timings: dict[str, float], stage: str, fn: Callable[[], T]) -> T:
        start = time.perf_counter()
        try:
            return fn()
        except PipelineError:
            raise
        except Exception as exc:
            raise PipelineError(stage, str(exc) or type(exc).__name__) from exc
        finally:
            timings[stage] = round((time.perf_counter() - start) * 1000, 2)

    def analyze(self, req: AnalyzeVideoRequest) -> AnalyzeVideoResponse:
        a = self.adapters
        timings: dict[str, float] = {}
        warnings: list[str] = []
        brief = req.brief or QaBrief()
        hints = {k: v for k, v in (("app", brief.app_name), ("brand", brief.brand_name or brief.app_name)) if v}
        video = VideoRef(
            uri=req.video.uri,
            sha256=req.video.sha256,
            duration_ms=req.video.duration_ms,
            width=req.video.width,
            height=req.video.height,
            hints=hints,
        )

        probe = self._timed(timings, "probe", lambda: a.prober.probe(video))
        duration, width, height = probe.duration_ms, probe.width, probe.height
        transcript = self._timed(timings, "transcribe", lambda: a.transcriber.transcribe(video))
        cuts = self._timed(timings, "scenes", lambda: a.scene_detector.detect(video, duration))
        times = frame_times(duration, req.options.frame_interval_ms, req.options.max_frames)
        ctx = VlmContext(app_name=brief.app_name, competitor_names=tuple(brief.competitor_names))
        frames = self._timed(timings, "frames", lambda: a.vlm.describe_frames(video, times, ctx))
        key_times = (
            [times[round(i * (len(times) - 1) / max(KEYFRAMES - 1, 1))] for i in range(KEYFRAMES)] if times else []
        )
        thumbs = self._timed(timings, "thumbnails", lambda: a.frames.thumbnails(video, sorted(set(key_times))))
        audio = self._timed(timings, "audio", lambda: a.audio.analyze(video, duration))
        if not thumbs:
            raise PipelineError("thumbnails", "no keyframes could be read, so no perceptual hash can be computed")
        phash = video_phash((t.gray, t.width, t.height) for t in thumbs)

        segments = transcript.segments
        on_screen = merge_on_screen_text(frames, duration)
        scenes = build_scenes(cuts, frames, duration)
        hook = observe_hook(segments, on_screen, frames, scenes, req.format_id)

        # beats: the brief's, or the default five (none required) when there is no brief
        brief_beats = list(brief.beats) or [BriefBeatIn(beat=b, required=False) for b in DEFAULT_BEATS]  # type: ignore[arg-type]
        bctx = BeatContext(
            duration_ms=duration,
            transcript=segments,
            on_screen_text=on_screen,
            scenes=scenes,
            app_name=brief.app_name,
            talking_points=brief.talking_points,
            offer_line=brief.offer_line,
            cta=brief.cta,
        )
        vision = _aggregate_vision(frames, hook.features.face_ms)
        beats = detect_beats(brief_beats, bctx)
        located = [_locate_hit(b, bctx) for b in ENUM_BEAT_IDS]  # every beat, for format inference and the order check
        tags_format = req.format_id or infer_format_id(
            scenes,
            segments,
            located,
            hook.hook_type,
            hook.features.face_ms is not None,
            [f.description for f in frames if f.description],
        )
        format_order = infer_format_order(located, tags_format)

        # auto-QA
        known = list(req.known_hashes)
        match = closest_match(phash, known, exclude_id=req.submission_id) if known else None
        qa_resp: QaResponse | None = None
        checks: list[QaCheckOut] = []
        if req.options.run_qa:
            qa_req = QaRequest(
                submission_id=req.submission_id,
                media=QaMedia(duration_ms=duration, width=width, height=height),
                transcript=list(segments),
                on_screen_text=on_screen,
                scenes=scenes,
                audio=QaAudio(
                    music_detected=audio.music_detected,
                    music_licensed=audio.music_licensed,
                    dead_air_gaps_ms=list(audio.dead_air_gaps_ms),
                    speech_ratio=audio.speech_ratio,
                    loudness_lufs=audio.loudness_lufs,
                    clipping=audio.clipping,
                ),
                vision=vision,
                brief=brief if req.brief else QaBrief(beats=[]),
                phash=phash,
                known_hashes=known,
            )
            qa_resp = run_qa(qa_req)
            checks = qa_resp.checks
        else:
            warnings.append("QA was skipped (options.run_qa=false); checks is empty.")

        # scores
        hook_resp = score_hook(HookScoreRequest(**hook.features.model_dump(), creator_median_views=None))
        spoken, shown = disclosure_presence(segments, on_screen)
        n_ctas, cta_found = count_ctas(segments, on_screen)
        win = locate_beat("win_state", bctx) is not None
        flow_kwargs: dict[str, object] = {"hook_points": hook_resp.points}
        if req.brief and brief.beats:
            flow_kwargs["beats"] = [b.model_dump() for b in beats]
        else:
            flow_kwargs.update(beats_found=0, beats_required=0)
        flow_features = FlowFeatures(
            **flow_kwargs,
            app_ms=hook.features.app_ms,
            disclosure_audio=spoken,
            disclosure_onscreen=shown,
            duration_s=duration / 1000,
            captions_in_safe_zone=hook.features.captions_in_safe_zone,
            single_cta=n_ctas == 1,
            ends_on_win_state=win,
            audio_gaps=audio_gap_count(audio),
            format_order=format_order,
            format_id=tags_format,
        )
        flow_resp = score_flow(
            FlowScoreRequest(**flow_features.model_dump(), creator_median_views=req.creator_median_views)
        )

        # embedding
        vec = self._timed(
            timings, "embed", lambda: a.embedder.embed_video(video, frames, " ".join(s.text for s in segments))
        )
        embedding = EmbeddingInfo(
            model=a.embedder.name, dim=len(vec), vector=list(vec) if req.options.include_embedding else None
        )

        words = hook.text.split()
        tags = VideoTags(
            format_id=tags_format,
            hook_type=hook.hook_type,
            hook_words=" ".join(words[:6]),
            time_to_app_reveal_ms=hook.features.app_ms,
            cta_type=primary_cta(cta_found),
        )
        hook_analysis = HookAnalysis(
            text=hook.text,
            hook_type=hook.hook_type,
            lands_at_ms=hook.features.lands_ms,
            face_at_ms=hook.features.face_ms,
            app_at_ms=hook.features.app_ms,
            caption_at_ms=hook.caption_ms,
            spoken_matches_onscreen=hook.features.spoken_matches_onscreen,
        )

        reasons, fixes = self._explain(hook_resp, flow_resp, qa_resp)
        summary = f"Hook Score {hook_resp.band} ({hook_resp.points}), Flow Score {flow_resp.band} ({flow_resp.points})."
        if qa_resp is not None:
            summary += f" QA: {qa_resp.verdict}."
        if match and match[0] <= 6:
            summary += f" Looks like a duplicate of {match[1].id}."
        stage = self.stage
        if stage == "fake":
            warnings.append(
                "Analysed with fake adapters (deterministic dev mode, no GPU). Do not treat this as a real model's output."
            )
        if flow_resp.points == 0:
            warnings.append("Flow Score is 0; check that the video was readable.")
        return AnalyzeVideoResponse(
            id=analysis_id(req.submission_id, req.version, req.video.uri),
            model=MODEL,
            submission_id=req.submission_id,
            version=req.version,
            duration_ms=duration,
            language=transcript.language,
            transcript=list(segments),
            transcript_text=" ".join(s.text for s in segments),
            on_screen_text=on_screen,
            scenes=scenes,
            hook=hook_analysis,
            beats=beats,
            tags=tags,
            checks=checks,
            hook_score=ScoreCard(
                band=hook_resp.band, points=hook_resp.points, items=hook_resp.items, label=hook_resp.label
            ),
            flow_score=ScoreCard(
                band=flow_resp.band, points=flow_resp.points, items=flow_resp.items, label=flow_resp.label
            ),
            phash=phash,
            duplicate_of_submission_id=match[1].id if match and match[0] <= 6 else None,
            analysed_at=self.clock(),
            qa=None
            if qa_resp is None
            else QaSummary(
                verdict=qa_resp.verdict,
                passed=qa_resp.passed,
                auto_approvable=qa_resp.auto_approvable,
                blocks_settlement=qa_resp.blocks_settlement,
                suggested_reason_code=qa_resp.suggested_reason_code,
                summary=qa_resp.summary,
                skipped=list(qa_resp.skipped),
            ),
            hook_features=hook.features,
            flow_features=flow_features,
            predicted=flow_resp.predicted,
            reasons=reasons,
            fixes=fixes,
            summary=summary,
            embedding=embedding,
            adapters=a.names(),
            stage=stage,
            timings_ms=timings,
            warnings=warnings,
        )

    @staticmethod
    def _explain(
        hook_resp: HookScoreResponse, flow_resp: FlowScoreResponse, qa_resp: QaResponse | None
    ) -> tuple[list[Reason], list[Fix]]:
        """One ordered list: compliance and QA first, then the biggest score losses."""
        reasons: list[Reason] = []
        fixes: list[Fix] = []
        seen: set[tuple[str, str]] = set()
        if qa_resp is not None:
            reasons.extend(r for r in qa_resp.reasons if r.severity != "positive")
            fixes.extend(qa_resp.fixes)
        losses = [r for r in [*hook_resp.reasons, *flow_resp.reasons] if r.severity != "positive"]
        losses.sort(key=lambda r: r.impact or 0)
        for r in losses:
            key = (r.code, r.message)
            if key not in seen:
                seen.add(key)
                reasons.append(r)
        for f in sorted([*hook_resp.fixes, *flow_resp.fixes], key=lambda f: -(f.gain or 0)):
            key = (f.target or "", f.text)
            if key not in seen:
                seen.add(key)
                fixes.append(f)
        if not reasons:
            reasons.append(
                Reason(
                    code="clean",
                    severity="positive",
                    title="Nothing to fix",
                    message="Every checklist item is earned and every QA check passed.",
                )
            )
        return reasons, fixes
