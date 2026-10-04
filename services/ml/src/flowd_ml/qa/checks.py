"""The 14 automated QA checks (DOMAIN.md ``QaCheckType``). Each returns a ``CheckResult`` or ``None`` when it had no input.

Results are ``pass`` / ``warn`` / ``fail``: ``warn`` means a human decides, ``fail`` blocks auto-approve, and the two
disclosure checks additionally block settlement (compliance: ``#ad`` must be spoken AND shown).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from ..constants import (
    DUPLICATE_PHASH_MAX_DISTANCE,
    PLATFORM_RISKY_CLAIMS,
    QA_AI_FAIL_PROBABILITY,
    QA_AI_WARN_PROBABILITY,
    QA_ASPECT_TOLERANCE,
    QA_BEATS_FAIL_COVERAGE,
    QA_DEAD_AIR_MS,
    QA_DISCLOSURE_LATE_RATIO,
    QA_DISCLOSURE_ONSCREEN_MIN_MS,
    QA_DISCLOSURE_ONSCREEN_WARN_MS,
    QA_LOUDNESS_MAX_LUFS,
    QA_LOUDNESS_MIN_LUFS,
    QA_MIN_HEIGHT,
    QA_MIN_SPEECH_RATIO,
    QA_MIN_WIDTH,
    QA_MODERATION_FAIL,
    QA_MODERATION_WARN,
    QA_PHASH_WARN_DISTANCE,
    QA_SAFE_ZONE_FAIL_SHARE,
)
from ..numeric import timecode
from ..phash.index import closest_match
from ..schemas.common import BeatHit, Evidence, QaResult
from ..schemas.qa import QaRequest
from ..text.normalize import contains_phrase
from ..text.patterns import has_ai_label, has_onscreen_disclosure, spoken_disclosure_span


@dataclass(slots=True)
class CheckResult:
    result: QaResult
    message: str
    evidence: Evidence | None = None
    blocks_settlement: bool = False
    reason_code: str | None = None
    fix: str | None = None
    t_ms: int | None = None


def _quote(text: str, limit: int = 140) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    return t if len(t) <= limit else t[: limit - 3].rstrip() + "..."


def _ev_transcript(t_ms: int, text: str) -> Evidence:
    return Evidence(kind="transcript", ref=timecode(t_ms), excerpt=_quote(text), t_ms=t_ms)


def _ev_screen(t_ms: int, text: str) -> Evidence:
    return Evidence(kind="timecode", ref=timecode(t_ms), excerpt=_quote(text), t_ms=t_ms)


def _ev_brief(requirement: str) -> Evidence:
    return Evidence(kind="brief_requirement", ref=_quote(requirement, 160))


def _ev_check(check: str, excerpt: str | None = None) -> Evidence:
    return Evidence(kind="qa_check", ref=check, excerpt=excerpt)


# ── disclosure ─────────────────────────────────────────────────────────────────────────────────
def check_disclosure_audio(req: QaRequest) -> CheckResult:
    wording = req.brief.disclosure_text or "#ad"
    dur = max(req.media.duration_ms, 1)
    for seg in sorted(req.transcript, key=lambda s: s.t_start_ms):
        m = spoken_disclosure_span(seg.text)
        if m is None:
            continue
        if seg.t_start_ms > dur * QA_DISCLOSURE_LATE_RATIO:
            return CheckResult(
                "warn",
                f"Spoken disclosure comes late, at {timecode(seg.t_start_ms)} of {timecode(dur)}. Say it near the start.",
                _ev_transcript(seg.t_start_ms, seg.text),
                False,
                "missing_disclosure",
                'Move "this is a paid partnership" to the first 10 seconds.',
                seg.t_start_ms,
            )
        return CheckResult(
            "pass",
            f'#ad is spoken at {timecode(seg.t_start_ms)} ("{m.group(0)}").',
            _ev_transcript(seg.t_start_ms, seg.text),
            t_ms=seg.t_start_ms,
        )
    return CheckResult(
        "fail",
        "No spoken #ad or paid-partnership line was found in the transcript.",
        _ev_brief(wording),
        True,
        "missing_disclosure",
        'Say "this is a paid partnership" near the start and keep #ad on screen for 2 seconds.',
    )


def check_disclosure_onscreen(req: QaRequest) -> CheckResult:
    wording = req.brief.disclosure_text or "#ad"
    best = None
    for o in req.on_screen_text:
        if has_onscreen_disclosure(o.text):
            length = o.t_end_ms - o.t_start_ms
            if best is None or length > best[0].t_end_ms - best[0].t_start_ms:
                best = (o, length)
    if best is None:
        return CheckResult(
            "fail",
            "No #ad label was found in the on-screen text.",
            _ev_brief(wording),
            True,
            "missing_disclosure",
            "Keep #ad on screen for at least 2 seconds, inside the safe zone.",
        )
    o, length = best
    ev = _ev_screen(o.t_start_ms, o.text)
    if length < QA_DISCLOSURE_ONSCREEN_WARN_MS:
        return CheckResult(
            "fail",
            f"#ad is on screen for only {length / 1000:.1f}s (needs 2s).",
            ev,
            True,
            "missing_disclosure",
            "Keep #ad on screen for at least 2 seconds.",
            o.t_start_ms,
        )
    if length < QA_DISCLOSURE_ONSCREEN_MIN_MS:
        return CheckResult(
            "warn",
            f"#ad is on screen for {length / 1000:.1f}s; keep it up for 2 seconds.",
            ev,
            False,
            "missing_disclosure",
            "Hold the #ad label for 2 seconds.",
            o.t_start_ms,
        )
    if not o.in_safe_zone:
        return CheckResult(
            "warn",
            "#ad is on screen but outside the platform safe zone, so the app UI may cover it.",
            ev,
            False,
            "missing_disclosure",
            "Move #ad above the bottom bar.",
            o.t_start_ms,
        )
    return CheckResult(
        "pass", f"#ad is on screen at {timecode(o.t_start_ms)} for {length / 1000:.1f}s.", ev, t_ms=o.t_start_ms
    )


# ── music, claims, AI ──────────────────────────────────────────────────────────────────────────
def check_music(req: QaRequest) -> CheckResult | None:
    a = req.audio
    if a is None or a.music_detected is None:
        return None
    if not a.music_detected:
        return CheckResult("pass", "No music detected.")
    if req.brief.music_policy == "original_only":
        return CheckResult(
            "fail",
            "Music detected, but this bounty requires original audio only.",
            _ev_check("music_licence", "music_policy=original_only"),
            False,
            "music_not_licensed",
            "Remove the music track and re-export with original audio only.",
        )
    if a.music_licensed is True:
        return CheckResult("pass", "Music matches a commercial-library track.")
    if a.music_licensed is False:
        return CheckResult(
            "fail",
            "Music does not match a commercial-library track, so it is not cleared for ads.",
            _ev_check("music_licence"),
            False,
            "music_not_licensed",
            "Swap it for a commercial-library track or remove the music.",
        )
    return CheckResult(
        "warn",
        "Music was detected but could not be matched to the commercial library; a reviewer should check it.",
        _ev_check("music_licence"),
        False,
        "music_not_licensed",
        "Confirm the track is from the commercial music library.",
    )


def _scan(req: QaRequest, phrase: str) -> tuple[int, str, str] | None:
    """First transcript or on-screen occurrence of ``phrase``: ``(t_ms, source, text)``."""
    hits: list[tuple[int, str, str]] = []
    for seg in req.transcript:
        if contains_phrase(seg.text, phrase):
            hits.append((seg.t_start_ms, "said", seg.text))
    for o in req.on_screen_text:
        if contains_phrase(o.text, phrase):
            hits.append((o.t_start_ms, "shown on screen", o.text))
    return min(hits, key=lambda h: h[0]) if hits else None


def check_banned_claims(req: QaRequest) -> CheckResult:
    for claim in req.brief.banned_claims:
        hit = _scan(req, claim)
        if hit:
            t, how, text = hit
            ev = _ev_transcript(t, text) if how == "said" else _ev_screen(t, text)
            return CheckResult(
                "fail",
                f'The banned claim "{claim}" is {how} at {timecode(t)}.',
                ev,
                False,
                "banned_claim",
                "Rephrase using the approved wording in the brief.",
                t,
            )
    for claim in PLATFORM_RISKY_CLAIMS:
        hit = _scan(req, claim)
        if hit:
            t, how, text = hit
            ev = _ev_transcript(t, text) if how == "said" else _ev_screen(t, text)
            return CheckResult(
                "warn",
                f'"{claim}" is {how} at {timecode(t)}. Income, health and results guarantees are risky on every platform.',
                ev,
                False,
                "banned_claim",
                "Remove the guarantee or soften it to what you personally experienced.",
                t,
            )
    n = len(req.brief.banned_claims)
    return CheckResult(
        "pass", f"No banned claims found ({n} brand phrase{'s' if n != 1 else ''} plus the platform risk list checked)."
    )


def check_ai_content(req: QaRequest) -> CheckResult | None:
    v = req.vision
    if v is None or v.ai_generated_probability is None:
        return None
    p = v.ai_generated_probability
    texts = [o.text for o in req.on_screen_text] + [s.text for s in req.transcript]
    labelled = any(has_ai_label(t) for t in texts)
    if p >= QA_AI_FAIL_PROBABILITY:
        if req.brief.ai_policy == "not_allowed":
            return CheckResult(
                "fail",
                f"AI-generated media detected (p={p:.2f}), and this brief does not allow it.",
                _ev_check("ai_content", f"p={p:.2f}"),
                False,
                "ai_content_undisclosed",
                "Re-shoot with real footage; AI-generated video or voice is not allowed here.",
            )
        if not labelled:
            return CheckResult(
                "fail",
                f"AI-generated media detected (p={p:.2f}) with no visible AI label.",
                _ev_check("ai_content", f"p={p:.2f}"),
                False,
                "ai_content_undisclosed",
                'Add the "AI-generated" label on screen.',
            )
        return CheckResult(
            "pass",
            f"AI-generated media detected (p={p:.2f}) and labelled on screen.",
            _ev_check("ai_content", f"p={p:.2f}"),
        )
    if p >= QA_AI_WARN_PROBABILITY and not labelled:
        return CheckResult(
            "warn",
            f"Possible AI-generated media (p={p:.2f}); a reviewer should look.",
            _ev_check("ai_content", f"p={p:.2f}"),
            False,
            "ai_content_undisclosed",
            'If any of it is AI-generated, add the "AI-generated" label.',
        )
    return CheckResult("pass", f"No AI-generated media detected (p={p:.2f}).")


# ── duplicates, watermarks ─────────────────────────────────────────────────────────────────────
def check_duplicate(req: QaRequest) -> CheckResult | None:
    if req.phash is None:
        return None
    if not req.known_hashes:
        return CheckResult("pass", "No earlier videos to compare against.")
    best = closest_match(req.phash, req.known_hashes, exclude_id=req.submission_id)
    if best is None:
        return CheckResult("pass", "No earlier videos to compare against.")
    d, k = best
    ev = _ev_check("duplicate", f"{k.id}, distance {d}")
    if d <= DUPLICATE_PHASH_MAX_DISTANCE:
        own = k.kind == "own_earlier"
        who = "an earlier video of yours" if own else "another creator's video"
        return CheckResult(
            "fail",
            f"Matches {who} ({k.id}, perceptual-hash distance {d} of 64).",
            ev,
            False,
            "duplicate_content" if own else "unoriginal_clip",
            "Film a new original take." if own else "Use only your own footage and screen recordings.",
        )
    if d <= QA_PHASH_WARN_DISTANCE:
        return CheckResult(
            "warn",
            f"Close to {k.id} (perceptual-hash distance {d} of 64); a reviewer should compare them.",
            ev,
            False,
            "duplicate_content",
            "Make sure this is a new take, not a re-cut.",
        )
    return CheckResult(
        "pass",
        f"No match within distance {DUPLICATE_PHASH_MAX_DISTANCE} across {len(req.known_hashes):,} earlier videos (closest: {d}).",
    )


def check_watermark(req: QaRequest) -> CheckResult | None:
    v = req.vision
    competitors = req.brief.competitor_names
    if (v is None or (v.watermarks is None and v.competitor_logos is None)) and not competitors:
        return None
    if v and v.competitor_logos:
        return CheckResult(
            "fail",
            f"A competing app is visible: {', '.join(v.competitor_logos)}.",
            _ev_check("watermark", ", ".join(v.competitor_logos)),
            False,
            "competitor_shown",
            "Crop or re-record the section.",
        )
    for name in competitors:
        hit = _scan(req, name)
        if hit:
            t, how, text = hit
            ev = _ev_transcript(t, text) if how == "said" else _ev_screen(t, text)
            return CheckResult(
                "fail",
                f'The competitor "{name}" is {how} at {timecode(t)}.',
                ev,
                False,
                "competitor_shown",
                "Crop or re-record the section.",
                t,
            )
    if v and v.watermarks:
        return CheckResult(
            "fail",
            f"Another app's watermark or logo is visible: {', '.join(v.watermarks)}.",
            _ev_check("watermark", ", ".join(v.watermarks)),
            False,
            "watermark_present",
            "Re-export your screen recording without overlays.",
        )
    return CheckResult("pass", "No watermarks, overlays or competing apps found.")


# ── beats ──────────────────────────────────────────────────────────────────────────────────────
def check_brief_beats(req: QaRequest, hits: Sequence[BeatHit]) -> CheckResult | None:
    required = [h for h in hits if h.required]
    face_problem = None
    if (
        req.brief.require_face
        and req.vision is not None
        and req.vision.face_ms is not None
        and req.vision.face_ms > 2000
    ):
        face_problem = req.vision.face_ms
    if not required and face_problem is None:
        return None
    missing = [h for h in required if not h.found]
    if face_problem is not None and not missing:
        sev: QaResult = "fail" if face_problem > 5000 else "warn"
        return CheckResult(
            sev,
            f"This bounty needs a face on camera early; the first face appears at {timecode(face_problem)}.",
            _ev_check("brief_beats", "require_face"),
            False,
            "face_not_shown",
            "Re-record the opening with your face in frame.",
            face_problem,
        )
    if not missing:
        late_app = next((h for h in required if h.beat == "app_reveal" and h.t_ms is not None and h.t_ms > 3000), None)
        if late_app is not None:
            return CheckResult(
                "warn",
                f"The app first appears at {timecode(late_app.t_ms)}; the brief wants it on screen by 00:03.",
                _ev_check("brief_beats", "app_reveal"),
                False,
                "app_not_shown_early",
                "Cut to the app by 00:03, then come back to your face.",
                late_app.t_ms,
            )
        return CheckResult("pass", f"All {len(required)} required beats found.")
    coverage = (len(required) - len(missing)) / len(required)
    names = ", ".join(h.beat.replace("_", " ") for h in missing)
    first = missing[0]
    code = (
        "offer_not_stated"
        if first.beat == "offer"
        else "app_not_shown_early"
        if first.beat == "app_reveal"
        else "missing_required_beat"
    )
    brief_line = next(
        (b.label for b in req.brief.beats if b.beat == first.beat and b.label), first.beat.replace("_", " ")
    )
    return CheckResult(
        "fail" if coverage < QA_BEATS_FAIL_COVERAGE else "warn",
        f"{len(required) - len(missing)} of {len(required)} required beats found. Missing: {names}.",
        _ev_brief(brief_line),
        False,
        code,
        {
            "offer_not_stated": "Say the offer out loud once, near the end, before the call to action.",
            "app_not_shown_early": "Show the app on screen, ideally by 00:03.",
        }.get(code, f"Add the missing beat ({names}) from the shot checklist."),
    )


# ── format ─────────────────────────────────────────────────────────────────────────────────────
def check_safe_zone(req: QaRequest) -> CheckResult | None:
    if not req.on_screen_text:
        return None
    outside = [o for o in req.on_screen_text if not o.in_safe_zone]
    if not outside:
        return CheckResult("pass", f"All {len(req.on_screen_text)} on-screen text items are inside the safe zones.")
    total = sum(max(1, o.t_end_ms - o.t_start_ms) for o in req.on_screen_text)
    bad = sum(max(1, o.t_end_ms - o.t_start_ms) for o in outside)
    first = min(outside, key=lambda o: o.t_start_ms)
    share = bad / total
    return CheckResult(
        "fail" if share > QA_SAFE_ZONE_FAIL_SHARE else "warn",
        f"{len(outside)} of {len(req.on_screen_text)} on-screen text items sit outside the safe zones (first at {timecode(first.t_start_ms)}).",
        _ev_screen(first.t_start_ms, first.text),
        False,
        "other_requirement",
        "Move text above the bottom platform bar and clear of the side buttons.",
        first.t_start_ms,
    )


def _aspect(spec: str) -> float:
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$", spec)
    return float(m.group(1)) / float(m.group(2)) if m and float(m.group(2)) else 9 / 16


def check_aspect_ratio(req: QaRequest) -> CheckResult | None:
    w, h = req.media.width, req.media.height
    if not w or not h:
        return None
    want = _aspect(req.brief.aspect)
    got = w / h
    if abs(got - want) / want <= QA_ASPECT_TOLERANCE:
        return CheckResult("pass", f"{w}x{h} is {req.brief.aspect}.")
    return CheckResult(
        "fail",
        f"{w}x{h} is not {req.brief.aspect}.",
        _ev_check("aspect_ratio", f"{w}x{h}"),
        False,
        "wrong_format",
        "Re-export at 1080x1920.",
    )


def check_length(req: QaRequest) -> CheckResult:
    s = req.media.duration_ms / 1000
    lo, hi = req.brief.min_duration_s, req.brief.max_duration_s
    if lo <= s <= hi:
        return CheckResult("pass", f"{s:.0f}s is inside the {lo}-{hi}s range.")
    margin = max(2.0, 0.1 * (hi if s > hi else lo))
    gap = s - hi if s > hi else lo - s
    msg = f"{s:.0f}s is {'over' if s > hi else 'under'} the {lo}-{hi}s range by {gap:.0f}s."
    fix = f"Trim to {hi} seconds or less." if s > hi else f"Extend to at least {lo} seconds."
    return CheckResult(
        "warn" if gap <= margin else "fail", msg, _ev_check("length", f"{s:.1f}s"), False, "wrong_format", fix
    )


def check_resolution(req: QaRequest) -> CheckResult | None:
    w, h = req.media.width, req.media.height
    if not w or not h:
        return None
    short, long_ = min(w, h), max(w, h)
    if short < QA_MIN_WIDTH or long_ < QA_MIN_HEIGHT:
        return CheckResult(
            "fail",
            f"{w}x{h} is below the 720x1280 minimum.",
            _ev_check("resolution", f"{w}x{h}"),
            False,
            "low_video_quality",
            "Film near a window, hold steady, and export at 1080x1920.",
        )
    if short >= 1080 and long_ >= 1920:
        return CheckResult("pass", f"{w}x{h} meets the preferred 1080x1920.")
    return CheckResult("pass", f"{w}x{h} is accepted; 1080x1920 is preferred.")


def check_audio_clarity(req: QaRequest) -> CheckResult | None:
    a = req.audio
    if a is None or (
        a.dead_air_gaps_ms is None and a.speech_ratio is None and a.loudness_lufs is None and a.clipping is None
    ):
        return None
    gaps = [g for g in (a.dead_air_gaps_ms or []) if g > QA_DEAD_AIR_MS]
    problems: list[str] = []
    severe = False
    if len(gaps) >= 3:
        severe = True
    if gaps:
        problems.append(
            f"{len(gaps)} dead-air gap{'s' if len(gaps) != 1 else ''} over 1s (longest {max(gaps) / 1000:.1f}s)"
        )
    if a.speech_ratio is not None and a.speech_ratio < QA_MIN_SPEECH_RATIO:
        problems.append(f"speech is only {a.speech_ratio:.0%} of the video")
        severe = True
    if a.loudness_lufs is not None and not (QA_LOUDNESS_MIN_LUFS <= a.loudness_lufs <= QA_LOUDNESS_MAX_LUFS):
        problems.append(
            f"loudness is {a.loudness_lufs:.0f} LUFS (target {QA_LOUDNESS_MIN_LUFS:.0f} to {QA_LOUDNESS_MAX_LUFS:.0f})"
        )
    if a.clipping:
        problems.append("the audio clips")
        severe = True
    if not problems:
        return CheckResult("pass", "Speech is clear with no dead air over 1s.")
    return CheckResult(
        "fail" if severe else "warn",
        "Audio issues: " + "; ".join(problems) + ".",
        _ev_check("audio_clarity"),
        False,
        "audio_unclear",
        "Move closer to the mic, cut silences, and re-export.",
    )


def check_moderation(req: QaRequest) -> CheckResult | None:
    v = req.vision
    if v is None or not v.moderation:
        return None
    cat, score = max(v.moderation.items(), key=lambda kv: kv[1])
    ev = _ev_check("moderation", f"{cat}={score:.2f}")
    if score >= QA_MODERATION_FAIL:
        return CheckResult(
            "fail",
            f"The moderation model flagged {cat.replace('_', ' ')} ({score:.2f}).",
            ev,
            False,
            "brand_safety",
            "Review the do and don't list in the brief.",
        )
    if score >= QA_MODERATION_WARN:
        return CheckResult(
            "warn",
            f"The moderation model is unsure about {cat.replace('_', ' ')} ({score:.2f}); a reviewer should look.",
            ev,
            False,
            "brand_safety",
            "Review the do and don't list in the brief.",
        )
    return CheckResult("pass", f"Moderation clear (highest: {cat.replace('_', ' ')} {score:.2f}).")


CheckFn = Callable[[QaRequest], CheckResult | None]

SIMPLE_CHECKS: dict[str, CheckFn] = {
    "disclosure_audio": check_disclosure_audio,
    "disclosure_onscreen": check_disclosure_onscreen,
    "music_licence": check_music,
    "banned_claims": check_banned_claims,
    "ai_content": check_ai_content,
    "duplicate": check_duplicate,
    "watermark": check_watermark,
    "safe_zone": check_safe_zone,
    "aspect_ratio": check_aspect_ratio,
    "length": check_length,
    "resolution": check_resolution,
    "audio_clarity": check_audio_clarity,
    "moderation": check_moderation,
}
