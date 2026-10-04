"""Beat detection: did the video hit the beats the brief requires? Keyword rules over the transcript, on-screen text and
scene kinds, optionally unioned with beats the vision-language model already located."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field

from ..constants import FORMAT_BEATS, GENERIC_BEAT_ORDER
from ..schemas.common import BeatHit, OnScreenText, SceneCut, TranscriptSegment
from ..schemas.qa import BriefBeatIn
from ..text.normalize import contains_phrase, norm, overlap
from ..text.patterns import BEAT_PATTERNS, CTA_PATTERNS, WIN_WORDS, is_filler


@dataclass(frozen=True, slots=True)
class Utterance:
    t_start_ms: int
    t_end_ms: int
    text: str
    source: str  # 'speech' | 'screen'


@dataclass(slots=True)
class BeatContext:
    """Everything the rules look at."""

    duration_ms: int
    transcript: Sequence[TranscriptSegment] = field(default_factory=list)
    on_screen_text: Sequence[OnScreenText] = field(default_factory=list)
    scenes: Sequence[SceneCut] = field(default_factory=list)
    app_name: str | None = None
    talking_points: Sequence[str] = field(default_factory=list)
    offer_line: str | None = None
    cta: str = ""

    def utterances(self) -> Iterator[Utterance]:
        for s in self.transcript:
            yield Utterance(s.t_start_ms, s.t_end_ms, s.text, "speech")
        for o in self.on_screen_text:
            yield Utterance(o.t_start_ms, o.t_end_ms, o.text, "screen")

    def scene_at(self, t_ms: int) -> str | None:
        for sc in self.scenes:
            if sc.t_start_ms <= t_ms < sc.t_end_ms:
                return sc.kind
        return None


def _first(ctx: BeatContext, predicate) -> int | None:  # type: ignore[no-untyped-def]
    hits = [u.t_start_ms for u in ctx.utterances() if predicate(u)]
    return min(hits) if hits else None


def locate_beat(beat: str, ctx: BeatContext) -> int | None:
    """Time (ms) of the first evidence of ``beat``, or ``None`` when the rules find none."""
    dur = max(ctx.duration_ms, 1)
    if beat == "hook":
        speech = [s for s in ctx.transcript if s.t_start_ms < 3000 and not is_filler(s.text)]
        if speech:
            return min(s.t_start_ms for s in speech)
        screen = [o.t_start_ms for o in ctx.on_screen_text if o.t_start_ms < 3000]
        return min(screen) if screen else None
    if beat == "app_reveal":
        times: list[int] = []
        if ctx.app_name:
            named = _first(ctx, lambda u: contains_phrase(u.text, ctx.app_name or ""))
            if named is not None:
                times.append(named)
        said = _first(
            ctx, lambda u: u.source == "speech" and BEAT_PATTERNS["app_reveal"].search(norm(u.text)) is not None
        )
        if said is not None:
            times.append(said)
        times.extend(sc.t_start_ms for sc in ctx.scenes if sc.kind == "screen_recording")
        return min(times) if times else None
    if beat == "demo":
        screens = [
            sc.t_start_ms for sc in ctx.scenes if sc.kind == "screen_recording" and sc.t_end_ms - sc.t_start_ms >= 1500
        ]
        if screens:
            return min(screens)
        return _first(ctx, lambda u: u.source == "speech" and BEAT_PATTERNS["demo"].search(norm(u.text)) is not None)
    if beat == "key_feature":
        for tp in ctx.talking_points:
            t = _first(ctx, lambda u, tp=tp: overlap(tp, u.text) >= 0.6)
            if t is not None:
                return t
        return _first(ctx, lambda u: BEAT_PATTERNS["key_feature"].search(norm(u.text)) is not None)
    if beat == "offer":
        if ctx.offer_line:
            t = _first(ctx, lambda u: overlap(ctx.offer_line or "", u.text) >= 0.6)
            if t is not None:
                return t
        return _first(ctx, lambda u: BEAT_PATTERNS["offer"].search(norm(u.text)) is not None)
    if beat == "cta":
        t = _first(ctx, lambda u: any(p.search(norm(u.text)) for p in CTA_PATTERNS.values()))
        if t is not None:
            return t
        if ctx.cta:
            return _first(ctx, lambda u: overlap(ctx.cta, u.text) >= 0.7)
        return None
    if beat == "win_state":
        late = int(dur * 0.55)  # the payoff lands in the back half, before or around the CTA
        t = _first(
            ctx,
            lambda u: (
                u.t_start_ms >= late
                and (
                    WIN_WORDS.search(norm(u.text)) is not None
                    or BEAT_PATTERNS["win_state"].search(norm(u.text)) is not None
                )
            ),
        )
        if t is not None:
            return t
        if ctx.scenes and ctx.scenes[-1].kind == "screen_recording":
            return ctx.scenes[-1].t_start_ms
        return None
    if beat == "reaction":
        return _first(
            ctx, lambda u: u.source == "speech" and BEAT_PATTERNS["reaction"].search(norm(u.text)) is not None
        )
    if beat == "end_card":
        late = int(dur * 0.85)
        cards = [sc.t_start_ms for sc in ctx.scenes if sc.kind == "text_card" and sc.t_start_ms >= int(dur * 0.8)]
        if cards:
            return min(cards)
        return _first(
            ctx,
            lambda u: (
                u.source == "screen"
                and u.t_start_ms >= late
                and (
                    (ctx.app_name is not None and contains_phrase(u.text, ctx.app_name))
                    or any(p.search(norm(u.text)) for p in CTA_PATTERNS.values())
                )
            ),
        )
    pattern = BEAT_PATTERNS.get(beat)
    if pattern is None:
        return None
    return _first(ctx, lambda u: u.source == "speech" and pattern.search(norm(u.text)) is not None)


def detect_beats(
    brief_beats: Sequence[BriefBeatIn],
    ctx: BeatContext,
    vision_hits: Sequence[BeatHit] | None = None,
) -> list[BeatHit]:
    """One ``BeatHit`` per brief beat. A beat is found when the rules OR the vision model found it."""
    vision = {h.beat: h for h in (vision_hits or []) if h.found}
    out: list[BeatHit] = []
    for b in brief_beats:
        rule_t = locate_beat(b.beat, ctx)
        v = vision.get(b.beat)
        times = [t for t in (rule_t, v.t_ms if v else None) if t is not None]
        found = rule_t is not None or v is not None
        out.append(BeatHit(beat=b.beat, required=b.required, found=found, t_ms=min(times) if times else None))
    return out


def _lis_length(seq: Sequence[int]) -> int:
    tails: list[int] = []
    for x in seq:
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] < x:
                lo = mid + 1
            else:
                hi = mid
        if lo == len(tails):
            tails.append(x)
        else:
            tails[lo] = x
    return len(tails)


def infer_format_order(hits: Sequence[BeatHit], format_id: str | None) -> str:
    """``in_order`` / ``one_off`` / ``out_of_order`` for the Flow Score ``format_fit`` item.

    Take the found beats that the format (or the generic story arc) knows about, sort them by time, and see how many
    must be moved to put them in the format's order (n - longest increasing subsequence of their positions).
    """
    expected = FORMAT_BEATS.get(format_id or "", GENERIC_BEAT_ORDER)
    pos = {b: i for i, b in enumerate(expected)}
    timed = sorted(
        (h for h in hits if h.found and h.t_ms is not None and h.beat in pos), key=lambda h: (h.t_ms or 0, pos[h.beat])
    )
    if len(timed) < 2:
        return "in_order"
    moves = len(timed) - _lis_length([pos[h.beat] for h in timed])
    return "in_order" if moves == 0 else "one_off" if moves == 1 else "out_of_order"
