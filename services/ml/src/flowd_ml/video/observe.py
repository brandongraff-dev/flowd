"""Turn raw adapter output (transcript, cuts, per-frame facts, audio) into the observations the scores and QA read.

Everything here is a pure function over adapter results, so it is unit-tested with hand-built inputs and no adapters.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from ..constants import FACELESS_FORMATS, QA_DEAD_AIR_MS
from ..schemas.common import OnScreenText, SceneCut, TranscriptSegment
from ..schemas.scores import HookFeatures
from ..scoring.hook_types import classify_hook_text
from ..text.normalize import norm, overlap
from ..text.patterns import cta_types_in, has_onscreen_disclosure, is_filler, spoken_disclosure_span
from .adapters.base import AudioFacts, FrameFacts

HOOK_WINDOW_MS = 8000  # the first non-filler line must land inside this window to count as "the hook" at all
ONSCREEN_WINDOW_MS = 4000
MECHANISM_CTAS = ("link_in_bio", "use_code", "comment_for_link", "search_app_store", "download_now")


def frame_times(
    duration_ms: int, interval_ms: int = 500, max_frames: int = 80, dense_until_ms: int = 6000, sparse_ms: int = 2000
) -> list[int]:
    """Sample times: dense through the hook (every ``interval_ms`` up to 6s), then every 2 seconds."""
    times = list(range(0, min(dense_until_ms, max(duration_ms, 1)), interval_ms))
    t = max(dense_until_ms, interval_ms)
    while t < duration_ms:
        times.append(t)
        t += sparse_ms
    last = max(0, duration_ms - 250)
    if duration_ms > 0 and (not times or times[-1] < last - sparse_ms // 2):
        times.append(last)
    return times[:max_frames]


@dataclass(slots=True)
class _OpenText:
    start: int
    text: str
    safe: bool


def merge_on_screen_text(frames: Sequence[FrameFacts], duration_ms: int) -> list[OnScreenText]:
    """Collapse per-frame OCR lines into timed text items. A line lasts from its first frame to the next sampled frame."""
    ordered = sorted(frames, key=lambda f: f.t_ms)
    open_: dict[str, _OpenText] = {}
    done: list[OnScreenText] = []

    def close(key: str, end_ms: int) -> None:
        o = open_.pop(key)
        done.append(
            OnScreenText(
                t_start_ms=o.start, t_end_ms=max(o.start, min(end_ms, duration_ms)), text=o.text, in_safe_zone=o.safe
            )
        )

    for f in ordered:
        seen = {norm(line.text): line for line in f.text if norm(line.text)}
        for key in list(open_):
            if key not in seen:
                close(key, f.t_ms)
        for key, line in seen.items():
            cur = open_.get(key)
            if cur is None:
                open_[key] = _OpenText(f.t_ms, line.text, line.in_safe_zone)
            else:
                cur.safe = cur.safe and line.in_safe_zone
    # Text still showing at the last sampled frame lasts one more sampling step.
    step = ordered[-1].t_ms - ordered[-2].t_ms if len(ordered) > 1 else 500
    last_t = ordered[-1].t_ms if ordered else 0
    for key in list(open_):
        close(key, last_t + step)
    return sorted(done, key=lambda o: (o.t_start_ms, o.text))


def build_scenes(cuts: Sequence[tuple[int, int]], frames: Sequence[FrameFacts], duration_ms: int) -> list[SceneCut]:
    """Scene spans from the detector's cuts, each labelled with the frames' majority scene kind."""
    ordered = sorted(frames, key=lambda f: f.t_ms)
    spans = sorted(cuts) or [(0, duration_ms)]
    scenes: list[SceneCut] = []
    last_kind = "broll"
    for start, end in spans:
        inside = [f.scene_kind for f in ordered if start <= f.t_ms < max(end, start + 1)]
        kind = max(set(inside), key=inside.count) if inside else last_kind
        last_kind = kind
        scenes.append(SceneCut(t_start_ms=start, t_end_ms=max(end, start), kind=kind))  # type: ignore[arg-type]
    return scenes


def _refine(prev_t: int, t: int, cut_starts: Sequence[int]) -> int:
    """If a cut fell between the previous sampled frame and this one, the thing appeared at the cut."""
    inside = [c for c in cut_starts if prev_t < c <= t]
    return min(inside) if inside else t


def first_frame_time(frames: Sequence[FrameFacts], predicate, cut_starts: Sequence[int]) -> int | None:  # type: ignore[no-untyped-def]
    prev = -1
    for f in sorted(frames, key=lambda x: x.t_ms):
        if predicate(f):
            return _refine(prev, f.t_ms, cut_starts) if prev >= 0 else f.t_ms
        prev = f.t_ms
    return None


def first_sentence(text: str, limit: int = 140) -> str:
    m = re.match(r"^(.+?[.!?])(?:\s|$)", text.strip())
    s = m.group(1) if m else text.strip()
    return s if len(s) <= limit else s[: limit - 3].rstrip() + "..."


@dataclass(frozen=True, slots=True)
class HookObservation:
    features: HookFeatures
    text: str
    hook_type: str | None
    caption_ms: int | None


def observe_hook(
    transcript: Sequence[TranscriptSegment],
    on_screen: Sequence[OnScreenText],
    frames: Sequence[FrameFacts],
    scenes: Sequence[SceneCut],
    format_id: str | None = None,
) -> HookObservation:
    """The first-seconds observations behind the Hook Score."""
    segs = sorted((s for s in transcript if s.text.strip()), key=lambda s: s.t_start_ms)
    speech_ms = segs[0].t_start_ms if segs else None
    hook_seg = next((s for s in segs if s.t_start_ms < HOOK_WINDOW_MS and not is_filler(s.text)), None)
    lands = hook_seg.t_start_ms if hook_seg else None
    text = first_sentence(hook_seg.text) if hook_seg else ""
    hook_type = classify_hook_text(text) if text else None

    ots = sorted(on_screen, key=lambda o: o.t_start_ms)
    early = next((o for o in ots if o.t_start_ms < ONSCREEN_WINDOW_MS), None)
    onscreen_ms = early.t_start_ms if early else None
    matches = bool(early and text and overlap(early.text, text) >= 0.6)

    cut_starts = [s.t_start_ms for s in scenes if s.t_start_ms > 0]
    face_ms = first_frame_time(frames, lambda f: f.has_face, cut_starts)
    app_ms = first_frame_time(frames, lambda f: f.app_visible, cut_starts)
    motion_ms = first_frame_time([f for f in frames if f.t_ms > 0], lambda f: f.motion >= 0.6, cut_starts)
    candidates = [c for c in (cut_starts[0] if cut_starts else None, motion_ms) if c is not None]
    interrupt_ms = min(candidates) if candidates else None

    slides = [s for s in scenes if s.kind == "slide"]
    faceless = (
        (format_id in FACELESS_FORMATS)
        if format_id
        else bool(face_ms is None and scenes and len(slides) >= 0.7 * len(scenes))
    )
    safe = bool(ots) and all(o.in_safe_zone for o in ots)

    features = HookFeatures(
        lands_ms=lands,
        onscreen_ms=onscreen_ms,
        spoken_matches_onscreen=matches,
        face_ms=face_ms,
        faceless=faceless,
        app_ms=app_ms,
        interrupt_ms=interrupt_ms,
        hook_type=hook_type,
        hook_type_known=hook_type is not None,
        speech_ms=speech_ms,
        captions_in_safe_zone=safe,  # type: ignore[arg-type]
    )
    return HookObservation(features=features, text=text, hook_type=hook_type, caption_ms=onscreen_ms)


def count_ctas(transcript: Sequence[TranscriptSegment], on_screen: Sequence[OnScreenText]) -> tuple[int, list[str]]:
    """Distinct calls to action. "Try it free" is the offer, not a second action when a mechanism (link, code ...) is also present."""
    text = " ".join([*(s.text for s in transcript), *(o.text for o in on_screen)])
    found = cta_types_in(text)
    mechanisms = [c for c in found if c in MECHANISM_CTAS]
    if mechanisms:
        return len(mechanisms), found
    return (1 if found else 0), found


def primary_cta(found: Sequence[str]) -> str | None:
    for c in (*MECHANISM_CTAS, "try_free"):
        if c in found:
            return c
    return None


def disclosure_presence(
    transcript: Sequence[TranscriptSegment], on_screen: Sequence[OnScreenText]
) -> tuple[bool, bool]:
    spoken = any(spoken_disclosure_span(s.text) for s in transcript)
    shown = any(has_onscreen_disclosure(o.text) for o in on_screen)
    return spoken, shown


def audio_gap_count(audio: AudioFacts) -> int:
    return sum(1 for g in audio.dead_air_gaps_ms if g > QA_DEAD_AIR_MS)
