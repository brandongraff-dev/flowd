"""Deterministic fake adapters: the whole video pipeline runs with zero GPU, zero downloads and zero network.

All of them read the same scripted ``Scenario`` (chosen from the uri), so a fake analysis is internally consistent. They
are the default in tests, CI and local development and are explicit about it: every adapter's ``name`` starts with
``fake-``, so a stored analysis can never be mistaken for a real model's output.
"""

from __future__ import annotations

import math
import random
from collections.abc import Sequence
from functools import lru_cache

from ...matching.embeddings import HashingEmbedder
from ...schemas.common import TranscriptSegment
from ..scenarios import Scenario, pick
from .base import (
    AdapterSet,
    AudioFacts,
    FrameFacts,
    FrameThumb,
    OcrLine,
    ProbeResult,
    TranscriptResult,
    VideoRef,
    VlmContext,
    WordTiming,
)

THUMB = 64


def _scenario(video: VideoRef) -> tuple[Scenario, int]:
    sc, seed = pick(video.uri)
    return sc.render(video.hints.get("app", "Lumi"), video.hints.get("brand", "Lumi")), seed


class FakeProber:
    name = "fake-prober"

    def probe(self, video: VideoRef) -> ProbeResult:
        sc, _ = _scenario(video)
        return ProbeResult(
            duration_ms=video.duration_ms or sc.duration_ms,
            width=video.width or sc.width,
            height=video.height or sc.height,
            fps=30.0,
        )


class FakeTranscriber:
    """Stands in for Whisper: the scenario's speech lines, with evenly spread word timings."""

    name = "fake-whisper"

    def transcribe(self, video: VideoRef) -> TranscriptResult:
        sc, _ = _scenario(video)
        segments = [
            TranscriptSegment(t_start_ms=line.t_start_ms, t_end_ms=line.t_end_ms, text=line.text) for line in sc.speech
        ]
        words: list[WordTiming] = []
        for line in sc.speech:
            toks = line.text.split()
            if not toks:
                continue
            step = (line.t_end_ms - line.t_start_ms) / len(toks)
            words.extend(
                WordTiming(w, round(line.t_start_ms + i * step), round(line.t_start_ms + (i + 1) * step))
                for i, w in enumerate(toks)
            )
        return TranscriptResult(language=sc.language, segments=segments, words=words)


class FakeSceneDetector:
    """Stands in for PySceneDetect: the scenario's scene boundaries."""

    name = "fake-pyscenedetect"

    def detect(self, video: VideoRef, duration_ms: int) -> list[tuple[int, int]]:
        sc, _ = _scenario(video)
        return [(s.t_start_ms, min(s.t_end_ms, duration_ms)) for s in sc.scenes if s.t_start_ms < duration_ms]


class FakeVisionLanguageModel:
    """Stands in for the vision-language model: per-frame facts read off the scenario timeline."""

    name = "fake-vlm"

    def describe_frames(self, video: VideoRef, timestamps_ms: Sequence[int], context: VlmContext) -> list[FrameFacts]:
        sc, _ = _scenario(video)
        facts: list[FrameFacts] = []
        for t in timestamps_ms:
            kind = sc.scene_kind_at(t)
            text = tuple(OcrLine(x.text, x.in_safe_zone) for x in sc.screen_text if x.t_start_ms <= t < x.t_end_ms)
            moving = any(abs(t - m) <= 250 for m in sc.motion_ms)
            facts.append(
                FrameFacts(
                    t_ms=t,
                    has_face=sc.in_spans(sc.face_spans, t),
                    app_visible=sc.in_spans(sc.app_spans, t),
                    scene_kind=kind,  # type: ignore[arg-type]
                    text=text,
                    watermarks=sc.watermarks if kind == "screen_recording" else (),
                    competitor_logos=sc.competitor_logos if kind == "screen_recording" else (),
                    ai_generated_probability=sc.ai_probability,
                    moderation=dict(sc.moderation),
                    motion=0.9 if moving else 0.05,
                    description=sc.descriptions.get(kind, ""),
                )
            )
        return facts


@lru_cache(maxsize=512)
def _base_pattern(seed: int) -> tuple[float, ...]:
    """A smooth, seed-specific grayscale pattern (low-frequency cosines): stable under the pHash, different per seed."""
    rng = random.Random(seed)
    comps = [(rng.randint(0, 4), rng.randint(0, 4), rng.uniform(18, 48), rng.uniform(0, 2 * math.pi)) for _ in range(7)]
    comps = [c for c in comps if c[0] or c[1]] or [(1, 1, 30.0, 0.0)]
    out: list[float] = []
    for y in range(THUMB):
        for x in range(THUMB):
            v = 128.0
            for fx, fy, amp, phase in comps:
                v += amp * math.cos(2 * math.pi * (fx * x + fy * y) / THUMB + phase)
            out.append(v)
    return tuple(out)


class FakeFrameSampler:
    """Stands in for ffmpeg / OpenCV keyframe extraction: 64x64 grayscale thumbnails from the scenario's visual seed."""

    name = "fake-frames"

    def thumbnails(self, video: VideoRef, timestamps_ms: Sequence[int]) -> list[FrameThumb]:
        _sc, seed = _scenario(video)
        base = _base_pattern(seed)
        thumbs: list[FrameThumb] = []
        for t in timestamps_ms:
            rng = random.Random(seed * 1_000_003 + t)
            data = bytes(max(0, min(255, round(v + rng.uniform(-2.0, 2.0)))) for v in base)
            thumbs.append(FrameThumb(t_ms=t, width=THUMB, height=THUMB, gray=data))
        return thumbs


class FakeAudioAnalyzer:
    """Stands in for ffmpeg ``silencedetect`` / ``ebur128``: the scenario's audio facts."""

    name = "fake-audio"

    def analyze(self, video: VideoRef, duration_ms: int) -> AudioFacts:
        sc, _ = _scenario(video)
        return sc.audio


class FakeVideoEmbedder:
    """Stands in for SigLIP / CLIP: a deterministic hashing embedding of what the frames show and the transcript says."""

    name = "fake-hashing-embedder"

    def __init__(self, dim: int = 256) -> None:
        self._inner = HashingEmbedder(dim)
        self.dim = dim

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        return self._inner.embed_texts(texts)

    def embed_video(self, video: VideoRef, frames: Sequence[FrameFacts], transcript_text: str) -> list[float]:
        seen: list[str] = []
        for f in frames:
            if f.description and f.description not in seen:
                seen.append(f.description)
        return self._inner.embed_texts([" ".join([*seen, transcript_text])])[0]


def fake_adapters(embedding_dim: int = 256) -> AdapterSet:
    return AdapterSet(
        prober=FakeProber(),
        transcriber=FakeTranscriber(),
        scene_detector=FakeSceneDetector(),
        vlm=FakeVisionLanguageModel(),
        frames=FakeFrameSampler(),
        audio=FakeAudioAnalyzer(),
        embedder=FakeVideoEmbedder(embedding_dim),
    )
