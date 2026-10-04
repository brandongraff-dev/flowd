"""Scripted scenarios for the deterministic fake adapters.

A scenario is a small, believable timeline of one video (speech, on-screen text, scenes, faces, the app, audio facts).
The fake Whisper, PySceneDetect, vision-language and audio adapters all read the same scenario, so a fake analysis is
internally consistent: the transcript, the frames and the QA verdict agree. ``fake://<name>`` picks one by name; any other
URI picks one by hash, so every uploaded test file always analyses the same way. Brand names in scripts are fictional.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from urllib.parse import parse_qs, urlparse

from .adapters.base import AudioFacts


@dataclass(frozen=True, slots=True)
class Line:
    t_start_ms: int
    t_end_ms: int
    text: str


@dataclass(frozen=True, slots=True)
class ScreenText:
    t_start_ms: int
    t_end_ms: int
    text: str
    in_safe_zone: bool = True


@dataclass(frozen=True, slots=True)
class Span:
    t_start_ms: int
    t_end_ms: int
    kind: str = ""


@dataclass(frozen=True, slots=True)
class Scenario:
    name: str
    description: str
    duration_ms: int
    speech: tuple[Line, ...]
    screen_text: tuple[ScreenText, ...]
    scenes: tuple[Span, ...]
    face_spans: tuple[Span, ...] = ()
    app_spans: tuple[Span, ...] = ()
    motion_ms: tuple[int, ...] = ()
    audio: AudioFacts = field(default_factory=AudioFacts)
    width: int = 1080
    height: int = 1920
    language: str = "en"
    watermarks: tuple[str, ...] = ()
    competitor_logos: tuple[str, ...] = ()
    ai_probability: float = 0.03
    moderation: dict[str, float] = field(default_factory=lambda: {"violence": 0.01, "sexual": 0.01, "hate": 0.0})
    descriptions: dict[str, str] = field(default_factory=dict)  # scene kind -> what the VLM says it sees

    def in_spans(self, spans: tuple[Span, ...], t_ms: int) -> bool:
        return any(s.t_start_ms <= t_ms < s.t_end_ms for s in spans)

    def scene_kind_at(self, t_ms: int) -> str:
        for s in self.scenes:
            if s.t_start_ms <= t_ms < s.t_end_ms:
                return s.kind
        return "broll"

    def render(self, app: str, brand: str) -> Scenario:
        """Fill the ``{app}`` / ``{brand}`` placeholders."""

        def fill(text: str) -> str:
            return text.replace("{app}", app).replace("{brand}", brand)

        return replace(
            self,
            speech=tuple(replace(line, text=fill(line.text)) for line in self.speech),
            screen_text=tuple(replace(t, text=fill(t.text)) for t in self.screen_text),
        )


def _ms(seconds: float) -> int:
    return round(seconds * 1000)


def _line(a: float, b: float, text: str) -> Line:
    return Line(_ms(a), _ms(b), text)


def _text(a: float, b: float, text: str, safe: bool = True) -> ScreenText:
    return ScreenText(_ms(a), _ms(b), text, safe)


def _span(a: float, b: float, kind: str = "") -> Span:
    return Span(_ms(a), _ms(b), kind)


STRONG = Scenario(
    name="strong_screen_reaction",
    description="Screen record + reaction: confession hook at 0.3s, app flash at 1.2s, #ad spoken and shown, one CTA, ends on a win.",
    duration_ms=24_000,
    speech=(
        _line(0.3, 2.0, "I was wrong about AI photo apps."),
        _line(2.1, 4.9, "This is a paid partnership with {brand}, and look at what {app} just did to my selfie."),
        _line(5.0, 9.5, "I tap one button, pick the glow-up style, and watch this."),
        _line(9.6, 14.0, "Look at that. Wow, no way. It kept my face and fixed the lighting."),
        _line(14.2, 19.0, "It saved me an hour of editing, and the result is honestly so good."),
        _line(19.2, 23.0, "Try it free for seven days. Link in bio."),
    ),
    screen_text=(
        _text(0.4, 2.4, "I was wrong about AI photo apps"),
        _text(2.5, 5.0, "#ad Paid partnership with {brand}"),
        _text(20.0, 23.5, "Try {app} free - link in bio"),
    ),
    scenes=(
        _span(0, 1.2, "face"),
        _span(1.2, 2.2, "screen_recording"),
        _span(2.2, 5.0, "face"),
        _span(5.0, 14.0, "screen_recording"),
        _span(14.0, 19.0, "face"),
        _span(19.0, 24.0, "text_card"),
    ),
    face_spans=(_span(0.3, 1.2), _span(2.2, 5.0), _span(14.0, 19.5)),
    app_spans=(_span(1.2, 2.2), _span(5.0, 14.0), _span(19.0, 24.0)),
    motion_ms=(1200, 2200, 5000, 14000),
    audio=AudioFacts(
        music_detected=False,
        music_licensed=None,
        dead_air_gaps_ms=(),
        speech_ratio=0.84,
        loudness_lufs=-16.0,
        clipping=False,
    ),
    descriptions={
        "face": "Creator talking to camera in natural light",
        "screen_recording": "Phone screen recording of the {app} app generating a glow-up",
        "text_card": "End card with the app name and a link-in-bio prompt",
    },
)

SLOW = Scenario(
    name="slow_hook_no_disclosure",
    description="Slow intro (hook lands at 3.4s), app appears at 9s, no #ad anywhere, captions outside the safe zone, dead air, two CTAs.",
    duration_ms=31_000,
    speech=(
        _line(0.0, 2.4, "Hey guys, welcome back to my channel."),
        _line(3.4, 7.0, "So today I want to show you a photo app that I have been using lately."),
        _line(9.0, 14.0, "You just open {app}, upload a selfie, and it generates a bunch of styles."),
        _line(16.5, 21.0, "It is pretty cool, I like how it handles the background."),
        _line(23.0, 28.5, "Download it on the App Store, or use my link in bio, and use code GLOW10."),
    ),
    screen_text=(_text(3.5, 7.0, "photo app i use", False), _text(25.0, 29.0, "download now - use code GLOW10", False)),
    scenes=(
        _span(0, 8.8, "face"),
        _span(8.8, 15.0, "screen_recording"),
        _span(15.0, 22.0, "face"),
        _span(22.0, 31.0, "face"),
    ),
    face_spans=(_span(0.0, 8.8), _span(15.0, 31.0)),
    app_spans=(_span(9.0, 15.0),),
    motion_ms=(8800, 15000),
    audio=AudioFacts(
        music_detected=False, dead_air_gaps_ms=(1800, 1200), speech_ratio=0.62, loudness_lufs=-19.0, clipping=False
    ),
    descriptions={
        "face": "Creator talking to camera indoors",
        "screen_recording": "Phone screen recording of the {app} app",
    },
)

BANNED = Scenario(
    name="banned_claim",
    description="A strong structure that says 'guaranteed results' out loud: fails the banned-claims check.",
    duration_ms=22_000,
    speech=(
        _line(0.3, 1.9, "Confession: I never edit my photos by hand anymore."),
        _line(2.0, 4.6, "This is a paid partnership with {brand}. {app} gives you guaranteed results every time."),
        _line(4.8, 12.0, "Watch me upload this one, tap generate, and boom."),
        _line(12.5, 17.0, "Finally a photo app that works. It is so much easier."),
        _line(18.0, 21.0, "Try it free, link in bio."),
    ),
    screen_text=(
        _text(0.4, 2.2, "I never edit photos by hand anymore"),
        _text(2.3, 4.7, "#ad paid partnership"),
        _text(18.0, 21.0, "link in bio"),
    ),
    scenes=(
        _span(0, 1.1, "face"),
        _span(1.1, 2.0, "screen_recording"),
        _span(2.0, 4.6, "face"),
        _span(4.6, 12.0, "screen_recording"),
        _span(12.0, 22.0, "face"),
    ),
    face_spans=(_span(0.3, 1.1), _span(2.0, 4.6), _span(12.0, 22.0)),
    app_spans=(_span(1.1, 2.0), _span(4.6, 12.0)),
    motion_ms=(1100, 2000, 4600),
    audio=AudioFacts(music_detected=False, dead_air_gaps_ms=(), speech_ratio=0.8, loudness_lufs=-17.0, clipping=False),
    descriptions={"face": "Creator talking to camera", "screen_recording": "Phone screen recording of the {app} app"},
)

AI_UNLABELLED = Scenario(
    name="ai_unlabelled",
    description="Looks AI-generated (p=0.88) with no visible AI label; music is not from the commercial library.",
    duration_ms=20_000,
    speech=(
        _line(0.4, 2.0, "Why is nobody talking about this app?"),
        _line(2.1, 4.5, "Paid partnership with {brand}. {app} turned my sketch into a photo."),
        _line(4.8, 12.0, "Tap, wait three seconds, and look at the result."),
        _line(15.0, 19.0, "Search {app} in the App Store."),
    ),
    screen_text=(
        _text(0.5, 2.2, "Why is nobody talking about this app?"),
        _text(2.3, 4.6, "#ad Paid partnership with {brand}"),
    ),
    scenes=(
        _span(0, 1.3, "face"),
        _span(1.3, 2.0, "screen_recording"),
        _span(2.0, 4.5, "face"),
        _span(4.5, 14.0, "screen_recording"),
        _span(14.0, 20.0, "face"),
    ),
    face_spans=(_span(0.4, 1.3), _span(2.0, 4.5), _span(14.0, 20.0)),
    app_spans=(_span(1.3, 2.0), _span(4.5, 14.0)),
    motion_ms=(1300, 2000, 4500),
    audio=AudioFacts(
        music_detected=True,
        music_licensed=False,
        dead_air_gaps_ms=(),
        speech_ratio=0.7,
        loudness_lufs=-15.0,
        clipping=False,
    ),
    ai_probability=0.88,
    descriptions={
        "face": "Smooth synthetic-looking face talking",
        "screen_recording": "Phone screen recording of the {app} app",
    },
)

WATERMARKED = Scenario(
    name="watermark_competitor",
    description="Screen recording with another app's watermark and a competing app on screen.",
    duration_ms=26_000,
    speech=(
        _line(0.3, 2.0, "POV: you finally found a photo app you do not delete."),
        _line(2.1, 5.0, "Paid partnership with {brand}, this is {app}."),
        _line(5.2, 15.0, "Let me show you how it works, tap here, then here."),
        _line(16.0, 21.0, "The result is better than my old app, honestly."),
        _line(22.0, 25.5, "Try it free, link in bio."),
    ),
    screen_text=(
        _text(0.4, 2.2, "POV: a photo app you keep"),
        _text(2.3, 5.0, "#ad {brand}"),
        _text(22.0, 25.5, "link in bio"),
    ),
    scenes=(
        _span(0, 1.0, "face"),
        _span(1.0, 2.0, "screen_recording"),
        _span(2.0, 5.0, "face"),
        _span(5.0, 15.0, "screen_recording"),
        _span(15.0, 26.0, "face"),
    ),
    face_spans=(_span(0.3, 1.0), _span(2.0, 5.0), _span(15.0, 26.0)),
    app_spans=(_span(1.0, 2.0), _span(5.0, 15.0)),
    motion_ms=(1000, 2000, 5000),
    audio=AudioFacts(music_detected=False, dead_air_gaps_ms=(), speech_ratio=0.78, loudness_lufs=-16.5, clipping=False),
    watermarks=("ClipCut",),
    competitor_logos=("PixelPal",),
    descriptions={
        "face": "Creator talking to camera",
        "screen_recording": "Screen recording with a ClipCut watermark and a PixelPal app icon",
    },
)

FACELESS = Scenario(
    name="faceless_slideshow",
    description="Faceless slideshow with voice-over: six slides, the app on slide 4, one CTA, #ad on the last slide.",
    duration_ms=22_000,
    speech=(
        _line(0.2, 2.8, "Five things nobody tells you about editing photos on your phone."),
        _line(3.0, 7.0, "One, you do not need a big camera. Two, light matters more than filters."),
        _line(11.0, 15.0, "Three, an app like {app} can fix the background for you."),
        _line(15.5, 19.0, "Four, save the result and compare it with the original."),
        _line(19.2, 21.5, "Paid partnership with {brand}. Try it free, link in bio."),
    ),
    screen_text=(
        _text(0.3, 2.9, "5 things nobody tells you"),
        _text(3.0, 7.0, "1. You do not need a big camera"),
        _text(11.0, 15.0, "3. Let {app} fix the background"),
        _text(19.0, 22.0, "#ad  link in bio"),
    ),
    scenes=(
        _span(0, 3, "slide"),
        _span(3, 7, "slide"),
        _span(7, 11, "slide"),
        _span(11, 15.5, "slide"),
        _span(15.5, 19, "slide"),
        _span(19, 22, "slide"),
    ),
    app_spans=(_span(11.0, 15.5),),
    motion_ms=(3000, 7000, 11000, 15500, 19000),
    audio=AudioFacts(music_detected=False, dead_air_gaps_ms=(), speech_ratio=0.74, loudness_lufs=-17.5, clipping=False),
    descriptions={"slide": "A slide with large text over a gradient background"},
)

LANDSCAPE = Scenario(
    name="long_landscape",
    description="A 58-second 1920x1080 landscape export: wrong format, too long.",
    duration_ms=58_000,
    width=1920,
    height=1080,
    speech=(
        _line(0.5, 4.0, "Today I am going to review a photo editing app from start to finish."),
        _line(10.0, 40.0, "First I open {app}, then I import twelve photos, then I go through the menus one by one."),
        _line(50.0, 57.0, "That is the review. Thanks for watching."),
    ),
    screen_text=(_text(1.0, 5.0, "photo app review"),),
    scenes=(_span(0, 9, "face"), _span(9, 50, "screen_recording"), _span(50, 58, "face")),
    face_spans=(_span(0.5, 9.0), _span(50.0, 58.0)),
    app_spans=(_span(9.0, 50.0),),
    motion_ms=(9000, 50000),
    audio=AudioFacts(
        music_detected=False,
        dead_air_gaps_ms=(2400, 1500, 1100),
        speech_ratio=0.45,
        loudness_lufs=-21.0,
        clipping=False,
    ),
    descriptions={"face": "Creator talking to camera", "screen_recording": "Desktop capture of the {app} app"},
)

UNSAFE = Scenario(
    name="unsafe_content",
    description="Otherwise fine, but the moderation model flags sexual content (0.86).",
    duration_ms=18_000,
    speech=(
        _line(0.3, 2.0, "I did not expect to use this app every day."),
        _line(2.1, 4.4, "Paid partnership with {brand}, this is {app}."),
        _line(5.0, 15.0, "Watch me try the new style, and wow."),
        _line(15.5, 17.5, "Link in bio, try it free."),
    ),
    screen_text=(
        _text(0.4, 2.2, "I did not expect to use this daily"),
        _text(2.3, 4.5, "#ad {brand}"),
        _text(15.5, 17.8, "link in bio"),
    ),
    scenes=(
        _span(0, 1.1, "face"),
        _span(1.1, 2.0, "screen_recording"),
        _span(2.0, 5.0, "face"),
        _span(5.0, 15.0, "screen_recording"),
        _span(15.0, 18.0, "face"),
    ),
    face_spans=(_span(0.3, 1.1), _span(2.0, 5.0), _span(15.0, 18.0)),
    app_spans=(_span(1.1, 2.0), _span(5.0, 15.0)),
    motion_ms=(1100, 2000, 5000),
    audio=AudioFacts(music_detected=False, dead_air_gaps_ms=(), speech_ratio=0.8, loudness_lufs=-16.0, clipping=False),
    moderation={"violence": 0.02, "sexual": 0.86, "hate": 0.0},
    descriptions={"face": "Creator talking to camera", "screen_recording": "Phone screen recording of the {app} app"},
)

SCENARIOS: dict[str, Scenario] = {
    s.name: s for s in (STRONG, SLOW, BANNED, AI_UNLABELLED, WATERMARKED, FACELESS, LANDSCAPE, UNSAFE)
}
# What an unrecognised uri analyses as: the three everyday shapes, picked by hash so every test file is stable.
_DEFAULT_POOL = (STRONG, STRONG, SLOW, FACELESS)


def uri_digest(uri: str) -> int:
    return int.from_bytes(hashlib.sha256(uri.encode("utf-8")).digest()[:8], "big")


def pick(uri: str) -> tuple[Scenario, int]:
    """The scenario and visual seed for a uri. ``fake://<name>?seed=<n>``: same seed means the same footage (a duplicate)."""
    parsed = urlparse(uri)
    name = (parsed.netloc or parsed.path.strip("/")).split("/")[0] if parsed.scheme == "fake" else ""
    query = parse_qs(parsed.query)
    seed = (
        int(query["seed"][0])
        if "seed" in query and query["seed"][0].lstrip("-").isdigit()
        else uri_digest(uri) % 1_000_003
    )
    scenario = SCENARIOS.get(name) or _DEFAULT_POOL[uri_digest(uri) % len(_DEFAULT_POOL)]
    return scenario, seed
