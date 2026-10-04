"""Tags for the Creative Intelligence Library: which format is it, what hook, how fast does the app appear, which CTA."""

from __future__ import annotations

import re
from collections.abc import Sequence

from ..schemas.common import BeatHit, SceneCut, TranscriptSegment
from ..text.normalize import norm

_GREEN = re.compile(r"\bgreen[- ]screen\b", re.I)
_REPLY = re.compile(
    r"\b(?:replying to|reply to (?:a|this|that) comment|someone (?:asked|commented)|a comment (?:said|asked))\b", re.I
)
_RESULTS = re.compile(r"\bday \d+\b|\bbefore (?:and|vs\.?) (?:after|now)\b|\bone month (?:in|later)\b", re.I)
_IDENTITY = re.compile(r"\bi became (?:someone|a person|the kind)\b|\bsomeone who\b", re.I)
_HIDDEN = re.compile(r"\b(?:slept on|hidden gem|underrated|nobody (?:talks|is talking) about)\b", re.I)


def infer_format_id(
    scenes: Sequence[SceneCut],
    transcript: Sequence[TranscriptSegment],
    beats: Sequence[BeatHit],
    hook_type: str | None,
    face_seen: bool,
    descriptions: Sequence[str] = (),
) -> str | None:
    """Best-effort Studio format of a video, from its structure. ``None`` when nothing fits (never a forced guess)."""
    text = norm(" ".join(s.text for s in transcript))
    desc = norm(" ".join(descriptions))
    found = {b.beat: b for b in beats if b.found}
    total = sum(max(1, s.t_end_ms - s.t_start_ms) for s in scenes) or 1
    slide_share = sum(max(1, s.t_end_ms - s.t_start_ms) for s in scenes if s.kind == "slide") / total
    if slide_share >= 0.7 and not face_seen:
        return "tmpl_faceless_slideshow"
    if slide_share >= 0.7:
        return "tmpl_carousel_video"
    if _GREEN.search(desc) or _GREEN.search(text):
        return "tmpl_green_screen"
    if _REPLY.search(text):
        return "tmpl_reply_comment"
    if _IDENTITY.search(text):
        return "tmpl_identity_shift"
    if _RESULTS.search(text):
        return "tmpl_results_update"
    offer = found.get("offer")
    if offer is not None and offer.t_ms is not None and offer.t_ms <= 3000:
        return "tmpl_free_trial_lead"
    if _HIDDEN.search(text):
        return "tmpl_hidden_gem"
    kinds = {s.kind for s in scenes}
    if {"face", "screen_recording"} <= kinds and "reaction" in found:
        return "tmpl_screen_reaction"
    if hook_type == "confession":
        return "tmpl_confession"
    if "problem" in found and ("demo" in found or "app_reveal" in found) and "payoff" in found:
        return "tmpl_problem_solution"
    return None
