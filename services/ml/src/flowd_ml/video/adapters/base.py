"""Adapter interfaces for video understanding (BLUEPRINT ML system 1).

The pipeline never imports Whisper, PySceneDetect, a vision-language model or SigLIP directly. It talks to these
protocols, and an ``AdapterSet`` decides which implementation runs:

* ``fake``  deterministic, dependency-free adapters (``fake.py``) used in tests, CI and local dev: zero GPU, zero downloads;
* ``real``  GPU / API backed adapters (``real.py``) behind lazy imports, loaded on the worker image only.

Every adapter reports a ``name`` so a stored analysis always says which implementation produced it.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from ...schemas.common import SceneKind, TranscriptSegment


class AdapterUnavailableError(RuntimeError):
    """A real adapter's optional dependency (or credential) is missing. The message names the extra to install."""


@dataclass(frozen=True, slots=True)
class VideoRef:
    """Where a video lives. ``uri`` is a ``fake://`` scenario, a local path, an https URL or an object-store key."""

    uri: str
    sha256: str | None = None
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    hints: Mapping[str, str] = field(
        default_factory=dict
    )  # free-form context; the fake adapters read ``app`` and ``brand``


@dataclass(frozen=True, slots=True)
class ProbeResult:
    duration_ms: int
    width: int
    height: int
    fps: float = 30.0
    has_audio: bool = True


@dataclass(frozen=True, slots=True)
class WordTiming:
    word: str
    t_start_ms: int
    t_end_ms: int


@dataclass(frozen=True, slots=True)
class TranscriptResult:
    language: str
    segments: list[TranscriptSegment]
    words: list[WordTiming] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class OcrLine:
    text: str
    in_safe_zone: bool = True


@dataclass(frozen=True, slots=True)
class FrameFacts:
    """What the vision-language model saw in one sampled frame."""

    t_ms: int
    has_face: bool = False
    app_visible: bool = False
    scene_kind: SceneKind = "broll"
    text: tuple[OcrLine, ...] = ()
    watermarks: tuple[str, ...] = ()
    competitor_logos: tuple[str, ...] = ()
    ai_generated_probability: float | None = None
    moderation: dict[str, float] = field(default_factory=dict)
    motion: float = 0.0  # 0..1 visual change against the previous sampled frame
    description: str = ""


@dataclass(frozen=True, slots=True)
class VlmContext:
    """What the vision-language model should look for."""

    app_name: str | None = None
    competitor_names: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class AudioFacts:
    music_detected: bool | None = None
    music_licensed: bool | None = None
    dead_air_gaps_ms: tuple[int, ...] = ()
    speech_ratio: float | None = None
    loudness_lufs: float | None = None
    clipping: bool | None = None


@dataclass(frozen=True, slots=True)
class FrameThumb:
    """A small grayscale thumbnail (row-major bytes) used for perceptual hashing."""

    t_ms: int
    width: int
    height: int
    gray: bytes


@runtime_checkable
class Prober(Protocol):
    name: str

    def probe(self, video: VideoRef) -> ProbeResult: ...


@runtime_checkable
class Transcriber(Protocol):
    """Speech to text with timings (Whisper)."""

    name: str

    def transcribe(self, video: VideoRef) -> TranscriptResult: ...


@runtime_checkable
class SceneDetector(Protocol):
    """Hard-cut detection (PySceneDetect): ``(start_ms, end_ms)`` for each scene."""

    name: str

    def detect(self, video: VideoRef, duration_ms: int) -> list[tuple[int, int]]: ...


@runtime_checkable
class VisionLanguageModel(Protocol):
    """Frame understanding (a vision-language model such as Claude): faces, app, on-screen text, safety, scene kind."""

    name: str

    def describe_frames(
        self, video: VideoRef, timestamps_ms: Sequence[int], context: VlmContext
    ) -> list[FrameFacts]: ...


@runtime_checkable
class FrameSampler(Protocol):
    """Keyframe thumbnails for the perceptual hash."""

    name: str

    def thumbnails(self, video: VideoRef, timestamps_ms: Sequence[int]) -> list[FrameThumb]: ...


@runtime_checkable
class AudioAnalyzer(Protocol):
    name: str

    def analyze(self, video: VideoRef, duration_ms: int) -> AudioFacts: ...


@runtime_checkable
class VideoEmbedder(Protocol):
    """SigLIP / CLIP style joint embeddings. ``embed_video`` summarises the sampled frames plus the transcript."""

    name: str
    dim: int

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]: ...

    def embed_video(self, video: VideoRef, frames: Sequence[FrameFacts], transcript_text: str) -> list[float]: ...


@dataclass(frozen=True, slots=True)
class AdapterSet:
    """The full set of adapters one pipeline run uses."""

    prober: Prober
    transcriber: Transcriber
    scene_detector: SceneDetector
    vlm: VisionLanguageModel
    frames: FrameSampler
    audio: AudioAnalyzer
    embedder: VideoEmbedder

    def names(self) -> dict[str, str]:
        return {
            "prober": self.prober.name,
            "transcriber": self.transcriber.name,
            "scene_detector": self.scene_detector.name,
            "vlm": self.vlm.name,
            "frames": self.frames.name,
            "audio": self.audio.name,
            "embedder": self.embedder.name,
        }
