"""Reason codes (DOMAIN.md 12.1): why a video was not approved. Always about the video, never the person."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class ReasonCodeMeta:
    code: str
    label: str
    applies_to: str  # both | reject | admin
    category: str
    qa_check: str | None
    creator_copy: str
    fix_hint: str


_ROWS: Final[tuple[tuple[str, str, str, str, str | None, str, str], ...]] = (
    (
        "app_not_shown_early",
        "App not on screen early",
        "both",
        "hook",
        "brief_beats",
        "The app isn't on screen in the first 3 seconds.",
        "Cut to the app by 0:03, then come back to your face.",
    ),
    (
        "hook_too_late",
        "Hook lands too late",
        "both",
        "hook",
        None,
        "The hook doesn't land until after 2 seconds.",
        "Open on the hook line. Trim the intro or move the line to the very first frame.",
    ),
    (
        "missing_required_beat",
        "Missing a required beat",
        "both",
        "offer",
        "brief_beats",
        "A beat the brief requires is missing.",
        "Add the missing beat from the shot checklist, then re-check the score.",
    ),
    (
        "missing_disclosure",
        "Disclosure missing",
        "both",
        "disclosure",
        "disclosure_audio",
        "#ad needs to be spoken and shown on screen.",
        'Say "this is a paid partnership" and keep #ad on screen for 2 seconds.',
    ),
    (
        "offer_not_stated",
        "Offer not stated",
        "both",
        "offer",
        "brief_beats",
        "The free-trial offer isn't mentioned.",
        "Say the offer out loud once, near the end, before the call to action.",
    ),
    (
        "face_not_shown",
        "Face required",
        "both",
        "hook",
        None,
        "This bounty needs a face on camera in the first seconds.",
        "Re-record the opening with your face in frame.",
    ),
    (
        "audio_unclear",
        "Audio unclear",
        "both",
        "audio",
        "audio_clarity",
        "The speech is hard to hear or has dead air.",
        "Move closer to the mic, cut silences, and re-export.",
    ),
    (
        "music_not_licensed",
        "Music not licensed for ads",
        "both",
        "audio",
        "music_licence",
        "The music is not licensed for ads.",
        "Swap it for a commercial-library track or remove the music.",
    ),
    (
        "banned_claim",
        "Banned claim",
        "both",
        "claims",
        "banned_claims",
        "A claim in the video is on the brand's do-not-say list.",
        "Rephrase using the approved wording in the brief.",
    ),
    (
        "off_brief",
        "Doesn't match the brief",
        "both",
        "brand",
        None,
        "The concept doesn't follow the stated brief.",
        "Re-read the brief TL;DR and pick one of the suggested formats.",
    ),
    (
        "low_video_quality",
        "Video quality too low",
        "both",
        "pacing",
        "resolution",
        "The video is too dark, shaky or low resolution.",
        "Film near a window, hold steady, and export at 1080x1920.",
    ),
    (
        "wrong_format",
        "Wrong aspect or length",
        "both",
        "pacing",
        "aspect_ratio",
        "The video is not 9:16 or is outside the allowed length.",
        "Re-export at 1080x1920 and keep it between 15 and 30 seconds.",
    ),
    (
        "duplicate_content",
        "Duplicate video",
        "reject",
        "brand",
        "duplicate",
        "This video matches one that was already submitted or posted.",
        "Film a new original take.",
    ),
    (
        "unoriginal_clip",
        "Unoriginal clip",
        "reject",
        "brand",
        "duplicate",
        "The video reuses someone else's footage.",
        "Use only your own footage and screen recordings.",
    ),
    (
        "watermark_present",
        "Watermark present",
        "both",
        "brand",
        "watermark",
        "Another app's watermark or logo is visible.",
        "Re-export your screen recording without overlays.",
    ),
    (
        "competitor_shown",
        "Competitor shown",
        "both",
        "brand",
        None,
        "A competing app is visible on screen.",
        "Crop or re-record the section.",
    ),
    (
        "ai_content_undisclosed",
        "AI content not labelled",
        "both",
        "disclosure",
        "ai_content",
        "AI-generated media needs a visible AI label.",
        'Add the "AI-generated" label on screen.',
    ),
    (
        "brand_safety",
        "Brand-safety issue",
        "reject",
        "brand",
        "moderation",
        "The content is outside the brand's safety rules.",
        "Review the do and don't list in the brief.",
    ),
    (
        "region_mismatch",
        "Audience region mismatch",
        "reject",
        "brand",
        None,
        "Your audience isn't in this bounty's target regions.",
        "Look for bounties that match your audience; your next one may fit.",
    ),
    (
        "other_requirement",
        "Other stated requirement",
        "both",
        "brand",
        None,
        "A requirement written in the brief is missing.",
        "The quoted requirement shows exactly what to change.",
    ),
    (
        "suspected_fraud",
        "Suspected view fraud",
        "admin",
        "brand",
        None,
        "Views on this post were found to be invalid. Legitimate views delivered are still paid.",
        "You can dispute this from the post.",
    ),
)

REASON_CODES: Final[dict[str, ReasonCodeMeta]] = {r[0]: ReasonCodeMeta(*r) for r in _ROWS}


def meta(code: str) -> ReasonCodeMeta:
    return REASON_CODES[code]
