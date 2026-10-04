"""Real adapters: Whisper, PySceneDetect, a vision-language model (Claude), SigLIP / CLIP, ffmpeg.

Heavy dependencies are imported lazily, inside ``load()`` / the first call, so importing this module (and the whole
service) costs nothing and works on a laptop with none of them installed. A missing dependency raises
``AdapterUnavailableError`` naming the extra to install (``pip install 'flowd-ml[real]'``); nothing here ever falls back
silently to a fake. These classes run on the GPU worker image (see ``modal_app.py``).

Pure parsing helpers (``parse_ffprobe``, ``parse_ffmpeg_audio``, ``parse_vlm_json``) are separate functions so they are
unit-tested without any binary or model.
"""

from __future__ import annotations

import base64
import importlib
import json
import re
import shutil
import subprocess
from collections.abc import Sequence
from typing import Any

from ...schemas.common import TranscriptSegment
from .base import (
    AdapterSet,
    AdapterUnavailableError,
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

EXTRA = "pip install 'flowd-ml[real]'"


def require(module: str, package: str | None = None) -> Any:
    """Import ``module`` or raise ``AdapterUnavailableError`` with the install hint."""
    try:
        return importlib.import_module(module)
    except ImportError as exc:  # pragma: no cover - exercised through monkeypatched modules in tests
        raise AdapterUnavailableError(f"{module} is not installed ({package or module}). {EXTRA}") from exc


def require_binary(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise AdapterUnavailableError(f"{name} was not found on PATH; install ffmpeg on the worker image.")
    return path


# ── ffprobe ────────────────────────────────────────────────────────────────────────────────────
def parse_ffprobe(text: str) -> ProbeResult:
    """Parse ``ffprobe -print_format json -show_streams -show_format`` output."""
    data = json.loads(text)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise ValueError("no video stream")
    duration = float(video.get("duration") or data.get("format", {}).get("duration") or 0)
    num, _, den = str(video.get("avg_frame_rate", "30/1")).partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    width, height = int(video["width"]), int(video["height"])
    rotation = 0
    for sd in video.get("side_data_list", []) or []:
        rotation = int(sd.get("rotation", rotation))
    if abs(rotation) in (90, 270) or str(video.get("tags", {}).get("rotate", "0")) in ("90", "270"):
        width, height = height, width
    return ProbeResult(
        duration_ms=round(duration * 1000),
        width=width,
        height=height,
        fps=fps or 30.0,
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
    )


class FfprobeProber:
    name = "ffprobe"

    def __init__(self, binary: str = "ffprobe") -> None:
        self.binary = binary

    def probe(self, video: VideoRef) -> ProbeResult:
        exe = require_binary(self.binary)
        out = subprocess.run(  # noqa: S603
            [exe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", video.uri],
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        return parse_ffprobe(out.stdout)


# ── Whisper ────────────────────────────────────────────────────────────────────────────────────
class FasterWhisperTranscriber:
    """Speech to text with word timings via faster-whisper (CTranslate2). One model instance per worker.

    ``compute_type="auto"`` lets CTranslate2 pick the fastest type the device supports (a fixed float16 fails on a CPU-only host).
    """

    def __init__(self, model_size: str = "large-v3", device: str = "auto", compute_type: str = "auto") -> None:
        self.model_size, self.device, self.compute_type = model_size, device, compute_type
        self.name = f"faster-whisper-{model_size}"
        self._model: Any = None

    def load(self) -> Any:
        if self._model is None:
            fw = require("faster_whisper", "faster-whisper")
            self._model = fw.WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
        return self._model

    def transcribe(self, video: VideoRef) -> TranscriptResult:
        model = self.load()
        segments_iter, info = model.transcribe(video.uri, word_timestamps=True, vad_filter=True, beam_size=5)
        segments: list[TranscriptSegment] = []
        words: list[WordTiming] = []
        for seg in segments_iter:
            text = str(seg.text).strip()
            if not text:
                continue
            segments.append(
                TranscriptSegment(t_start_ms=round(seg.start * 1000), t_end_ms=round(seg.end * 1000), text=text)
            )
            for w in getattr(seg, "words", None) or []:
                words.append(WordTiming(str(w.word).strip(), round(w.start * 1000), round(w.end * 1000)))
        return TranscriptResult(language=str(getattr(info, "language", "en")), segments=segments, words=words)


# ── PySceneDetect ──────────────────────────────────────────────────────────────────────────────
class PySceneDetectDetector:
    name = "pyscenedetect-content"

    def __init__(self, threshold: float = 27.0, min_scene_len_frames: int = 8) -> None:
        self.threshold, self.min_scene_len = threshold, min_scene_len_frames

    def detect(self, video: VideoRef, duration_ms: int) -> list[tuple[int, int]]:
        sd = require("scenedetect", "scenedetect[opencv-headless]")
        scenes = sd.detect(video.uri, sd.ContentDetector(threshold=self.threshold, min_scene_len=self.min_scene_len))
        out = [(round(start.get_seconds() * 1000), round(end.get_seconds() * 1000)) for start, end in scenes]
        return out or [(0, duration_ms)]


# ── frames (OpenCV) ────────────────────────────────────────────────────────────────────────────
class OpenCvFrameReader:
    """Reads single frames at timestamps. Used by the sampler, the VLM and the embedder."""

    def read(self, uri: str, timestamps_ms: Sequence[int]) -> list[tuple[int, Any]]:
        cv2 = require("cv2", "opencv-python-headless")
        cap = cv2.VideoCapture(uri)
        if not cap.isOpened():
            raise AdapterUnavailableError(f"could not open {uri} with OpenCV")
        frames: list[tuple[int, Any]] = []
        try:
            for t in timestamps_ms:
                cap.set(cv2.CAP_PROP_POS_MSEC, float(t))
                ok, frame = cap.read()
                if ok:
                    frames.append((t, frame))
        finally:
            cap.release()
        return frames

    def jpeg(self, frame: Any, max_side: int = 768) -> bytes:
        cv2 = require("cv2", "opencv-python-headless")
        h, w = frame.shape[:2]
        scale = max_side / max(h, w)
        if scale < 1:
            frame = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if not ok:
            raise ValueError("jpeg encode failed")
        return bytes(buf.tobytes())


class OpenCvFrameSampler:
    """64x64 grayscale thumbnails (area-averaged) for the perceptual hash."""

    name = "opencv-frames"

    def __init__(self, size: int = 64) -> None:
        self.size = size
        self.reader = OpenCvFrameReader()

    def thumbnails(self, video: VideoRef, timestamps_ms: Sequence[int]) -> list[FrameThumb]:
        cv2 = require("cv2", "opencv-python-headless")
        out: list[FrameThumb] = []
        for t, frame in self.reader.read(video.uri, timestamps_ms):
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (self.size, self.size), interpolation=cv2.INTER_AREA)
            out.append(FrameThumb(t_ms=t, width=self.size, height=self.size, gray=bytes(small.tobytes())))
        return out


# ── vision-language model (Claude) ─────────────────────────────────────────────────────────────
VLM_SYSTEM = (
    "You are the frame-understanding step of a short-video QA pipeline for app ads. For every labelled frame answer "
    "with facts only. Reply with a single JSON object and nothing else."
)
VLM_PROMPT = """Frames are labelled with their timestamp in milliseconds. App name: {app}. Competing apps that must not appear: {competitors}.
Return JSON: {{"frames": [{{"t_ms": int, "has_face": bool, "app_visible": bool,
"scene_kind": "face"|"screen_recording"|"broll"|"text_card"|"slide",
"text": [{{"text": str, "in_safe_zone": bool}}], "watermarks": [str], "competitor_logos": [str],
"ai_generated_probability": number 0..1, "moderation": {{"sexual": number, "violence": number, "hate": number}},
"description": str}}]}}
in_safe_zone is false when text sits in the bottom 20% or the right 15% of a 9:16 frame where platform UI covers it."""


def parse_vlm_json(text: str) -> list[FrameFacts]:
    """Parse the model's JSON reply (code fences tolerated) into ``FrameFacts``, ordered by time."""
    body = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.S)
    data = json.loads(body)
    facts: list[FrameFacts] = []
    prev_desc = ""
    for f in data.get("frames", []):
        kind = f.get("scene_kind", "broll")
        if kind not in ("face", "screen_recording", "broll", "text_card", "slide"):
            kind = "broll"
        desc = str(f.get("description", ""))
        facts.append(
            FrameFacts(
                t_ms=int(f["t_ms"]),
                has_face=bool(f.get("has_face")),
                app_visible=bool(f.get("app_visible")),
                scene_kind=kind,
                text=tuple(
                    OcrLine(str(t.get("text", "")), bool(t.get("in_safe_zone", True)))
                    for t in f.get("text", [])
                    if t.get("text")
                ),
                watermarks=tuple(str(w) for w in f.get("watermarks", [])),
                competitor_logos=tuple(str(c) for c in f.get("competitor_logos", [])),
                ai_generated_probability=None
                if f.get("ai_generated_probability") is None
                else float(f["ai_generated_probability"]),
                moderation={str(k): float(v) for k, v in (f.get("moderation") or {}).items()},
                motion=0.0 if desc == prev_desc else 0.5,
                description=desc,
            )
        )
        prev_desc = desc
    return sorted(facts, key=lambda x: x.t_ms)


class ClaudeVisionLanguageModel:
    """Frame understanding with Claude (Anthropic SDK). Needs ``ANTHROPIC_API_KEY`` in the worker environment."""

    def __init__(
        self, model: str = "claude-sonnet-5-5", max_frames_per_call: int = 16, reader: OpenCvFrameReader | None = None
    ) -> None:
        self.model, self.max_frames = model, max_frames_per_call
        self.name = f"claude-vlm:{model}"
        self.reader = reader or OpenCvFrameReader()
        self._client: Any = None

    def load(self) -> Any:
        if self._client is None:
            anthropic = require("anthropic")
            self._client = anthropic.Anthropic()
        return self._client

    def describe_frames(self, video: VideoRef, timestamps_ms: Sequence[int], context: VlmContext) -> list[FrameFacts]:
        client = self.load()
        frames = self.reader.read(video.uri, timestamps_ms)
        facts: list[FrameFacts] = []
        for i in range(0, len(frames), self.max_frames):
            batch = frames[i : i + self.max_frames]
            content: list[dict[str, Any]] = []
            for t, frame in batch:
                content.append({"type": "text", "text": f"Frame at t_ms={t}"})
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": base64.b64encode(self.reader.jpeg(frame)).decode("ascii"),
                        },
                    }
                )
            content.append(
                {
                    "type": "text",
                    "text": VLM_PROMPT.format(
                        app=context.app_name or "unknown", competitors=", ".join(context.competitor_names) or "none"
                    ),
                }
            )
            message = client.messages.create(
                model=self.model, max_tokens=4096, system=VLM_SYSTEM, messages=[{"role": "user", "content": content}]
            )
            text = "".join(getattr(block, "text", "") for block in message.content)
            facts.extend(parse_vlm_json(text))
        return facts


# ── ffmpeg audio analysis ──────────────────────────────────────────────────────────────────────
_SILENCE_DUR = re.compile(r"silence_duration:\s*([0-9.]+)")
_LUFS = re.compile(r"\bI:\s*(-?[0-9.]+)\s*LUFS")
_TRUE_PEAK = re.compile(r"Peak:\s*(-?[0-9.]+|-?inf)\s*dBFS")


def parse_ffmpeg_audio(stderr: str, duration_ms: int, gap_min_ms: int = 1000) -> AudioFacts:
    """Parse ``silencedetect`` + ``ebur128`` output into audio facts (music detection needs a classifier; left unknown)."""
    gaps = [round(float(m) * 1000) for m in _SILENCE_DUR.findall(stderr)]
    long_gaps = tuple(g for g in gaps if g >= gap_min_ms)
    lufs_all = _LUFS.findall(stderr)
    peaks = [float(p) for p in _TRUE_PEAK.findall(stderr) if "inf" not in p]
    silent = sum(gaps)
    return AudioFacts(
        music_detected=None,
        music_licensed=None,
        dead_air_gaps_ms=long_gaps,
        speech_ratio=max(0.0, min(1.0, 1 - silent / duration_ms)) if duration_ms > 0 else None,
        loudness_lufs=float(lufs_all[-1]) if lufs_all else None,
        clipping=(max(peaks) > -0.1) if peaks else None,
    )


class FfmpegAudioAnalyzer:
    name = "ffmpeg-audio"

    def __init__(self, binary: str = "ffmpeg", noise_db: int = -35) -> None:
        self.binary, self.noise_db = binary, noise_db

    def analyze(self, video: VideoRef, duration_ms: int) -> AudioFacts:
        exe = require_binary(self.binary)
        out = subprocess.run(  # noqa: S603
            [
                exe,
                "-hide_banner",
                "-nostats",
                "-i",
                video.uri,
                "-af",
                f"silencedetect=noise={self.noise_db}dB:d=0.5,ebur128=peak=true",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
        return parse_ffmpeg_audio(out.stderr, duration_ms)


# ── SigLIP / CLIP ──────────────────────────────────────────────────────────────────────────────
class _TransformersEmbedder:
    """Shared base for SigLIP and CLIP: image-tower frames + text-tower transcript, averaged and L2-normalised."""

    model_class = "AutoModel"
    processor_class = "AutoProcessor"
    default_model = ""
    default_dim = 0
    short = ""

    def __init__(
        self, model_id: str | None = None, device: str | None = None, reader: OpenCvFrameReader | None = None
    ) -> None:
        self.model_id = model_id or self.default_model
        self.name = f"{self.short}:{self.model_id}"
        self.dim = self.default_dim
        self.device = device
        self.reader = reader or OpenCvFrameReader()
        self._model: Any = None
        self._processor: Any = None
        self._torch: Any = None

    def load(self) -> None:
        if self._model is not None:
            return
        torch = require("torch")
        tf = require("transformers")
        self._torch = torch
        device = self.device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._processor = getattr(tf, self.processor_class).from_pretrained(self.model_id)
        self._model = getattr(tf, self.model_class).from_pretrained(self.model_id).to(device).eval()
        self.device = device

    @staticmethod
    def _tensor(features: Any) -> Any:
        """``get_*_features`` returns a tensor; newer transformers releases may wrap it in a ``ModelOutput`` instead."""
        if hasattr(features, "norm"):
            return features
        for attr in ("pooler_output", "image_embeds", "text_embeds"):
            inner = getattr(features, attr, None)
            if inner is not None:
                return inner
        raise ValueError(f"unexpected feature output of type {type(features).__name__}")

    def _norm(self, feats: Any) -> list[list[float]]:
        torch = self._torch
        feats = self._tensor(feats)
        feats = feats / feats.norm(dim=-1, keepdim=True).clamp(min=1e-12)
        self.dim = int(feats.shape[-1])
        return [[float(x) for x in row] for row in torch.as_tensor(feats).detach().cpu().tolist()]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        self.load()
        torch = self._torch
        inputs = self._processor(
            text=list(texts), padding="max_length", truncation=True, max_length=64, return_tensors="pt"
        ).to(self.device)
        with torch.no_grad():
            return self._norm(self._model.get_text_features(**inputs))

    def embed_video(self, video: VideoRef, frames: Sequence[FrameFacts], transcript_text: str) -> list[float]:
        self.load()
        torch = self._torch
        pil = require("PIL.Image", "Pillow")
        picks = [f.t_ms for f in frames][:: max(1, len(frames) // 8)][:8]
        images = []
        for _t, frame in self.reader.read(video.uri, picks):
            cv2 = require("cv2", "opencv-python-headless")
            images.append(pil.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        vectors: list[list[float]] = []
        with torch.no_grad():
            if images:
                inputs = self._processor(images=images, return_tensors="pt").to(self.device)
                vectors.extend(self._norm(self._model.get_image_features(**inputs)))
        if transcript_text.strip():
            vectors.extend(self.embed_texts([transcript_text]))
        if not vectors:
            raise ValueError("nothing to embed")
        mean = [sum(col) / len(vectors) for col in zip(*vectors, strict=True)]
        n = sum(x * x for x in mean) ** 0.5 or 1.0
        return [x / n for x in mean]


class SigLipEmbedder(_TransformersEmbedder):
    default_model = "google/siglip-base-patch16-224"
    default_dim = 768
    short = "siglip"


class ClipEmbedder(_TransformersEmbedder):
    model_class = "CLIPModel"
    processor_class = "CLIPProcessor"
    default_model = "openai/clip-vit-base-patch32"
    default_dim = 512
    short = "clip"


def real_adapters(
    vlm_model: str = "claude-sonnet-5-5",
    whisper_model: str = "large-v3",
    embedder: str = "siglip",
    embedder_model: str | None = None,
) -> AdapterSet:
    """The production adapter set. Constructing it loads nothing: each adapter loads on first use."""
    emb: _TransformersEmbedder = ClipEmbedder(embedder_model) if embedder == "clip" else SigLipEmbedder(embedder_model)
    return AdapterSet(
        prober=FfprobeProber(),
        transcriber=FasterWhisperTranscriber(whisper_model),
        scene_detector=PySceneDetectDetector(),
        vlm=ClaudeVisionLanguageModel(vlm_model),
        frames=OpenCvFrameSampler(),
        audio=FfmpegAudioAnalyzer(),
        embedder=emb,  # type: ignore[arg-type]
    )
