"""Real adapters: lazy imports, helpful failures, and the mapping logic, tested with stand-in modules (no GPU, no downloads)."""

from __future__ import annotations

import json
import subprocess
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest

from flowd_ml.video.adapters import real
from flowd_ml.video.adapters.base import AdapterUnavailableError, VideoRef, VlmContext
from flowd_ml.video.adapters.real import (
    ClaudeVisionLanguageModel,
    ClipEmbedder,
    FasterWhisperTranscriber,
    FfmpegAudioAnalyzer,
    FfprobeProber,
    OpenCvFrameReader,
    OpenCvFrameSampler,
    PySceneDetectDetector,
    SigLipEmbedder,
    parse_ffmpeg_audio,
    parse_ffprobe,
    parse_vlm_json,
    real_adapters,
    require,
    require_binary,
)

VIDEO = VideoRef(uri="/data/clip.mp4")
SRC = Path(__file__).resolve().parents[1] / "src"


def test_importing_the_service_never_imports_a_heavy_dependency() -> None:
    code = (
        f"import sys; sys.path.insert(0, {str(SRC)!r}); import flowd_ml.main, flowd_ml.video.adapters.real, flowd_ml.training, flowd_ml.vectors;"
        "bad=[m for m in ('torch','transformers','faster_whisper','scenedetect','cv2','anthropic','numpy','lightgbm','PIL') if m in sys.modules];"
        "print(','.join(bad))"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=120)
    assert out.stdout.strip() == "", f"heavy modules imported eagerly: {out.stdout}"


def test_missing_dependencies_raise_with_the_install_hint() -> None:
    with pytest.raises(AdapterUnavailableError, match=r"flowd-ml\[real\]"):
        require("definitely_not_a_module_xyz")
    with pytest.raises(AdapterUnavailableError, match="ffmpeg"):
        require_binary("definitely-not-a-binary-xyz")
    for adapter, call in (
        (FasterWhisperTranscriber(), lambda a: a.transcribe(VIDEO)),
        (PySceneDetectDetector(), lambda a: a.detect(VIDEO, 1000)),
        (OpenCvFrameSampler(), lambda a: a.thumbnails(VIDEO, [0])),
    ):
        if _installed(adapter):
            continue
        with pytest.raises(AdapterUnavailableError):
            call(adapter)


def _installed(adapter: object) -> bool:
    mod = {
        "FasterWhisperTranscriber": "faster_whisper",
        "PySceneDetectDetector": "scenedetect",
        "OpenCvFrameSampler": "cv2",
    }[type(adapter).__name__]
    try:
        __import__(mod)
    except ImportError:
        return False
    return True


def test_real_adapter_set_is_constructed_without_loading_anything() -> None:
    s = real_adapters("claude-sonnet-5-5", "large-v3", "siglip")
    assert s.names() == {
        "prober": "ffprobe",
        "transcriber": "faster-whisper-large-v3",
        "scene_detector": "pyscenedetect-content",
        "vlm": "claude-vlm:claude-sonnet-5-5",
        "frames": "opencv-frames",
        "audio": "ffmpeg-audio",
        "embedder": "siglip:google/siglip-base-patch16-224",
    }
    assert real_adapters(embedder="clip").embedder.name == "clip:openai/clip-vit-base-patch32"
    assert SigLipEmbedder().dim == 768
    assert ClipEmbedder().dim == 512
    assert not any(n.startswith("fake-") for n in s.names().values())


# ── Whisper ─────────────────────────────────────────────────────────────────────────────────────
def test_whisper_maps_segments_words_and_language(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeModel:
        def __init__(self, size, device, compute_type):
            self.args = (size, device, compute_type)

        def transcribe(self, uri, **kw):
            assert uri == "/data/clip.mp4"
            assert kw["word_timestamps"]
            assert kw["vad_filter"]
            seg = SimpleNamespace(
                start=0.3,
                end=2.0,
                text=" I was wrong. ",
                words=[
                    SimpleNamespace(word=" I", start=0.3, end=0.5),
                    SimpleNamespace(word=" was", start=0.5, end=0.8),
                ],
            )
            blank = SimpleNamespace(start=2.0, end=2.1, text="   ", words=None)
            return iter([seg, blank]), SimpleNamespace(language="en")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeModel))
    t = FasterWhisperTranscriber("tiny", "cpu", "int8")
    r = t.transcribe(VIDEO)
    assert r.language == "en"
    assert [(s.t_start_ms, s.t_end_ms, s.text) for s in r.segments] == [(300, 2000, "I was wrong.")]
    assert [(w.word, w.t_start_ms, w.t_end_ms) for w in r.words] == [("I", 300, 500), ("was", 500, 800)]
    assert t.load().args == ("tiny", "cpu", "int8")
    assert t.load() is t.load()  # loaded once


# ── PySceneDetect ───────────────────────────────────────────────────────────────────────────────
def test_scenedetect_maps_timecodes(monkeypatch: pytest.MonkeyPatch) -> None:
    class TC:
        def __init__(self, s):
            self.s = s

        def get_seconds(self):
            return self.s

    calls = {}

    def detect(uri, detector):
        calls["detector"] = detector
        return [(TC(0.0), TC(1.25)), (TC(1.25), TC(5.0))]

    ns = types.SimpleNamespace(
        detect=detect, ContentDetector=lambda threshold, min_scene_len: ("content", threshold, min_scene_len)
    )
    monkeypatch.setitem(sys.modules, "scenedetect", ns)
    assert PySceneDetectDetector(threshold=30.0).detect(VIDEO, 5000) == [(0, 1250), (1250, 5000)]
    assert calls["detector"] == ("content", 30.0, 8)
    monkeypatch.setitem(
        sys.modules, "scenedetect", types.SimpleNamespace(detect=lambda u, d: [], ContentDetector=lambda **k: None)
    )
    assert PySceneDetectDetector().detect(VIDEO, 4200) == [(0, 4200)]  # no cuts: one scene


# ── vision-language model ───────────────────────────────────────────────────────────────────────
VLM_REPLY = """```json
{"frames": [
 {"t_ms": 1000, "has_face": false, "app_visible": true, "scene_kind": "screen_recording", "text": [{"text": "#ad", "in_safe_zone": false}],
  "watermarks": ["ClipCut"], "competitor_logos": [], "ai_generated_probability": 0.9, "moderation": {"sexual": 0.1}, "description": "app screen"},
 {"t_ms": 0, "has_face": true, "app_visible": false, "scene_kind": "weird_kind", "text": [{"text": ""}], "description": "creator"}
]}
```"""


def test_vlm_json_parsing_is_tolerant_and_sorted() -> None:
    facts = parse_vlm_json(VLM_REPLY)
    assert [f.t_ms for f in facts] == [0, 1000]
    assert facts[0].scene_kind == "broll"
    assert facts[0].has_face
    assert facts[0].text == ()  # unknown kinds degrade, empty text is dropped
    f = facts[1]
    assert f.app_visible
    assert f.scene_kind == "screen_recording"
    assert f.text[0].text == "#ad"
    assert not f.text[0].in_safe_zone
    assert f.watermarks == ("ClipCut",)
    assert f.ai_generated_probability == 0.9
    assert f.moderation == {"sexual": 0.1}
    assert parse_vlm_json('{"frames": []}') == []
    with pytest.raises(json.JSONDecodeError):
        parse_vlm_json("not json")


def test_claude_vlm_batches_frames_and_sends_images(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []

    class Messages:
        def create(self, **kw):
            sent.append(kw)
            return SimpleNamespace(content=[SimpleNamespace(text=VLM_REPLY)])

    monkeypatch.setitem(
        sys.modules, "anthropic", types.SimpleNamespace(Anthropic=lambda: SimpleNamespace(messages=Messages()))
    )

    class Reader(OpenCvFrameReader):
        def read(self, uri, timestamps_ms):
            return [(t, f"frame{t}") for t in timestamps_ms]

        def jpeg(self, frame, max_side=768):
            return str(frame).encode()

    vlm = ClaudeVisionLanguageModel("test-model", max_frames_per_call=2, reader=Reader())
    facts = vlm.describe_frames(VIDEO, [0, 500, 1000], VlmContext(app_name="Lumi", competitor_names=("PixelPal",)))
    assert len(sent) == 2  # three frames, two per call
    first = sent[0]
    assert first["model"] == "test-model"
    assert first["system"].startswith("You are the frame-understanding step")
    content = first["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "Frame at t_ms=0"}
    assert content[1]["source"]["media_type"] == "image/jpeg"
    assert "Lumi" in content[-1]["text"]
    assert "PixelPal" in content[-1]["text"]
    assert len(facts) == 4
    assert vlm.name == "claude-vlm:test-model"


# ── ffprobe / ffmpeg parsing ────────────────────────────────────────────────────────────────────
def test_ffprobe_parsing_including_rotation() -> None:
    info = {
        "streams": [
            {
                "codec_type": "video",
                "width": 1920,
                "height": 1080,
                "avg_frame_rate": "30000/1001",
                "duration": "24.0",
                "side_data_list": [{"rotation": -90}],
            },
            {"codec_type": "audio"},
        ],
        "format": {"duration": "24.1"},
    }
    p = parse_ffprobe(json.dumps(info))
    assert (p.duration_ms, p.width, p.height, p.has_audio) == (24_000, 1080, 1920, True)
    assert round(p.fps, 2) == 29.97
    silent = parse_ffprobe(
        json.dumps(
            {
                "streams": [{"codec_type": "video", "width": 1080, "height": 1920, "avg_frame_rate": "0/0"}],
                "format": {"duration": "10"},
            }
        )
    )
    assert silent.duration_ms == 10_000
    assert not silent.has_audio
    assert silent.fps == 30.0
    with pytest.raises(ValueError, match="no video stream"):
        parse_ffprobe(json.dumps({"streams": [{"codec_type": "audio"}]}))


FFMPEG_STDERR = """
[silencedetect @ 0x1] silence_start: 3.0
[silencedetect @ 0x1] silence_end: 4.8 | silence_duration: 1.8
[silencedetect @ 0x1] silence_end: 10.2 | silence_duration: 0.6
[silencedetect @ 0x1] silence_end: 15.4 | silence_duration: 1.2
  Integrated loudness:
    I:         -16.3 LUFS
  True peak:
    Peak:       -1.2 dBFS
"""


def test_ffmpeg_audio_parsing() -> None:
    a = parse_ffmpeg_audio(FFMPEG_STDERR, 24_000)
    assert a.dead_air_gaps_ms == (1800, 1200)  # the 0.6 s pause is natural speech rhythm
    assert a.speech_ratio == pytest.approx(1 - 3600 / 24_000)
    assert a.loudness_lufs == -16.3
    assert a.clipping is False
    assert a.music_detected is None
    assert a.music_licensed is None  # needs a classifier; unknown, never guessed
    assert parse_ffmpeg_audio("Peak: 0.0 dBFS I: -9.0 LUFS", 1000).clipping is True
    empty = parse_ffmpeg_audio("", 0)
    assert empty.speech_ratio is None
    assert empty.loudness_lufs is None
    assert empty.clipping is None


def test_subprocess_adapters_call_the_binaries(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []

    def fake_run(cmd, **kw):
        seen.append(cmd)
        if "ffprobe" in cmd[0]:
            return SimpleNamespace(
                stdout=json.dumps(
                    {
                        "streams": [
                            {
                                "codec_type": "video",
                                "width": 1080,
                                "height": 1920,
                                "avg_frame_rate": "30/1",
                                "duration": "12",
                            }
                        ]
                    }
                ),
                stderr="",
            )
        return SimpleNamespace(stdout="", stderr=FFMPEG_STDERR)

    monkeypatch.setattr(real.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(real.subprocess, "run", fake_run)
    assert FfprobeProber().probe(VIDEO).duration_ms == 12_000
    assert FfmpegAudioAnalyzer().analyze(VIDEO, 24_000).dead_air_gaps_ms == (1800, 1200)
    assert seen[0][-1] == "/data/clip.mp4"
    assert "silencedetect=noise=-35dB:d=0.5,ebur128=peak=true" in seen[1]


# ── OpenCV frames and embedders (stand-in tensors) ──────────────────────────────────────────────
def test_opencv_frame_sampler_makes_small_gray_thumbnails(monkeypatch: pytest.MonkeyPatch) -> None:
    class Frame:
        shape = (1920, 1080, 3)

    class Gray:
        def tobytes(self):
            return bytes(range(16))

    class Cap:
        def __init__(self, uri):
            self.t = 0

        def isOpened(self):
            return True

        def set(self, prop, value):
            self.t = value

        def read(self):
            return (self.t < 5000), Frame()

        def release(self):
            pass

    cv2 = types.SimpleNamespace(
        VideoCapture=Cap,
        CAP_PROP_POS_MSEC=0,
        COLOR_BGR2GRAY=6,
        INTER_AREA=3,
        cvtColor=lambda f, c: Gray(),
        resize=lambda g, size, interpolation: Gray(),
    )
    monkeypatch.setitem(sys.modules, "cv2", cv2)
    thumbs = OpenCvFrameSampler(size=4).thumbnails(VIDEO, [0, 1000, 9000])
    assert [t.t_ms for t in thumbs] == [0, 1000]  # a timestamp past the end yields no frame
    assert thumbs[0].width == 4
    assert len(thumbs[0].gray) == 16
    monkeypatch.setitem(
        sys.modules,
        "cv2",
        types.SimpleNamespace(VideoCapture=lambda uri: types.SimpleNamespace(isOpened=lambda: False)),
    )
    with pytest.raises(AdapterUnavailableError, match="could not open"):
        OpenCvFrameReader().read("/missing.mp4", [0])


def test_embedder_requires_torch_and_transformers() -> None:
    try:
        import torch  # noqa: F401
    except ImportError:
        with pytest.raises(AdapterUnavailableError, match=r"torch"):
            SigLipEmbedder().embed_texts(["x"])
    else:  # pragma: no cover - only on a machine with torch installed
        pytest.skip("torch is installed; the unavailable path is not reachable")


# ── SigLIP / CLIP with a numpy-backed stand-in for torch and transformers ───────────────────────
class _Tensor:
    """The few tensor operations the embedder uses, backed by numpy."""

    def __init__(self, values) -> None:
        import numpy as np

        self.a = np.asarray(values, dtype=float)

    @property
    def shape(self):
        return self.a.shape

    def norm(self, dim=-1, keepdim=False):
        import numpy as np

        return _Tensor(np.linalg.norm(self.a, axis=dim, keepdims=keepdim))

    def clamp(self, min):
        import numpy as np

        return _Tensor(np.maximum(self.a, min))

    def __truediv__(self, other):
        return _Tensor(self.a / other.a)

    def detach(self):
        return self

    def cpu(self):
        return self

    def tolist(self):
        return self.a.tolist()


class _Batch(dict):
    def to(self, _device):
        return self


def _install_fake_stack(monkeypatch: pytest.MonkeyPatch, *, wrap_outputs: bool = False) -> dict[str, list]:
    import contextlib

    seen: dict[str, list] = {"texts": [], "images": [], "devices": []}

    class Processor:
        @classmethod
        def from_pretrained(cls, _model_id):
            return cls()

        def __call__(self, text=None, images=None, **kwargs):
            if text is not None:
                seen["texts"].append((list(text), kwargs.get("padding"), kwargs.get("max_length")))
                return _Batch(kind="text", n=len(text), lengths=[len(t) for t in text])
            seen["images"].append(len(images))
            return _Batch(kind="image", n=len(images))

    class Model:
        @classmethod
        def from_pretrained(cls, _model_id):
            return cls()

        def to(self, device):
            seen["devices"].append(device)
            return self

        def eval(self):
            return self

        def _out(self, tensor):
            return SimpleNamespace(pooler_output=tensor) if wrap_outputs else tensor

        def get_text_features(self, kind, n, lengths):
            return self._out(_Tensor([[3.0, 4.0, float(length), 1.0] for length in lengths]))

        def get_image_features(self, kind, n):
            return self._out(_Tensor([[1.0, float(i + 1), 0.0, 2.0] for i in range(n)]))

    fake_torch = types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: False),
        no_grad=contextlib.nullcontext,
        as_tensor=lambda x: x,
    )
    fake_tf = types.SimpleNamespace(AutoModel=Model, AutoProcessor=Processor, CLIPModel=Model, CLIPProcessor=Processor)
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "transformers", fake_tf)
    return seen


class _FrameReader:
    def __init__(self) -> None:
        self.requested: list[int] = []

    def read(self, _uri, timestamps_ms):
        import numpy as np

        self.requested = list(timestamps_ms)
        return [(t, np.zeros((6, 6, 3), dtype=np.uint8)) for t in timestamps_ms]


def _norm_of(vec) -> float:
    return sum(x * x for x in vec) ** 0.5


@pytest.mark.parametrize("wrap_outputs", [False, True], ids=["tensor outputs", "ModelOutput outputs"])
def test_embedder_returns_unit_text_vectors(monkeypatch: pytest.MonkeyPatch, wrap_outputs: bool) -> None:
    pytest.importorskip("numpy")
    seen = _install_fake_stack(monkeypatch, wrap_outputs=wrap_outputs)
    emb = SigLipEmbedder(device=None)
    vectors = emb.embed_texts(["Money follows what works.", "first dollar"])
    assert len(vectors) == 2
    assert all(abs(_norm_of(v) - 1) < 1e-9 for v in vectors)
    assert emb.dim == 4
    assert seen["devices"] == ["cpu"], "no GPU in the stand-in torch, so the model stays on cpu"
    assert seen["texts"][0][1:] == ("max_length", 64), "SigLIP was trained on text padded to 64 tokens"
    assert emb.load() is None
    emb.embed_texts(["again"])
    assert seen["devices"] == ["cpu"], "the model loads once"


def test_embedder_averages_frame_and_transcript_vectors_into_one_unit_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("numpy")
    pytest.importorskip("PIL")
    _install_fake_stack(monkeypatch)
    monkeypatch.setitem(sys.modules, "cv2", types.SimpleNamespace(cvtColor=lambda f, _c: f, COLOR_BGR2RGB=4))
    from flowd_ml.video.adapters.base import FrameFacts

    reader = _FrameReader()
    emb = ClipEmbedder(reader=reader)
    frames = [FrameFacts(t_ms=t) for t in range(0, 24_000, 500)]  # 48 sampled frames
    vec = emb.embed_video(VIDEO, frames, "I was wrong about budgeting apps.")
    assert len(vec) == 4
    assert abs(_norm_of(vec) - 1) < 1e-9
    assert len(reader.requested) == 8, "at most eight evenly spaced frames reach the image tower"
    assert reader.requested == sorted(reader.requested)
    assert emb.name == "clip:openai/clip-vit-base-patch32"
    silent = emb.embed_video(VIDEO, frames[:3], "   ")
    assert abs(_norm_of(silent) - 1) < 1e-9, "a video with no speech embeds from its frames alone"
    with pytest.raises(ValueError, match="nothing to embed"):
        ClipEmbedder(reader=types.SimpleNamespace(read=lambda *_: [])).embed_video(VIDEO, [], "")


def test_unknown_feature_outputs_fail_loudly() -> None:
    with pytest.raises(ValueError, match="unexpected feature output"):
        SigLipEmbedder._tensor(SimpleNamespace(logits=1))


def test_jpeg_encoder_downsizes_large_frames_never_upscales_and_reports_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    np = pytest.importorskip("numpy")
    resized: list[tuple[int, int]] = []

    class Buf:
        def tobytes(self) -> bytes:
            return b"\xff\xd8jpeg"

    def resize(_frame, size, interpolation):
        resized.append(size)
        return np.zeros((size[1], size[0], 3), dtype=np.uint8)

    cv2 = types.SimpleNamespace(
        resize=resize, imencode=lambda _ext, _f, _params: (True, Buf()), INTER_AREA=3, IMWRITE_JPEG_QUALITY=1
    )
    monkeypatch.setitem(sys.modules, "cv2", cv2)
    reader = OpenCvFrameReader()
    assert reader.jpeg(np.zeros((1920, 1080, 3), dtype=np.uint8)) == b"\xff\xd8jpeg"
    assert resized == [(432, 768)], "a 1080x1920 frame is scaled to a 768 px long side (width, height)"
    resized.clear()
    reader.jpeg(np.zeros((100, 100, 3), dtype=np.uint8))
    assert resized == [], "small frames are never upscaled"
    cv2.imencode = lambda *_args: (False, None)
    with pytest.raises(ValueError, match="jpeg encode failed"):
        reader.jpeg(np.zeros((100, 100, 3), dtype=np.uint8))
