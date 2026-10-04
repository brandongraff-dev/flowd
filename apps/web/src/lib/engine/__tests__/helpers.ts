/**
 * Small inline test data (no fixtures: the engine tests must not depend on the generated fixtures).
 * This file is not a test; it only builds objects the contract types describe.
 */

import type { Brief, Deliverables, OnScreenText, QaCheck, TranscriptSegment } from "@/lib/contract/types";
import type { QaInput } from "../qa";

export const NOW = "2026-10-03T14:00:00Z";

export const brief = (over: Partial<Brief> = {}): Brief => ({
  summary: "Show how Lumi turns a selfie into a studio headshot in under a minute.",
  talking_points: ["Upload one selfie", "Pick a style", "Download in 60 seconds"],
  dos: ["Show the app on screen", "Say the free trial"],
  donts: ["Don't promise perfect results"],
  beats: [
    { beat: "hook", label: "Hook", required: true },
    { beat: "app_reveal", label: "App reveal", required: true },
    { beat: "demo", label: "Demo", required: true },
    { beat: "offer", label: "Offer", required: true },
    { beat: "cta", label: "Call to action", required: true },
  ],
  cta: "Try Lumi free for 7 days",
  offer_line: "7-day free trial",
  hashtags: ["#ad", "#lumi"],
  mentions: ["@lumi"],
  tone: "Casual, honest, a little amazed",
  disclosure_text: "#ad Paid partnership with Lumi",
  banned_claims: ["guaranteed results", "100% realistic"],
  ...over,
});

export const deliverables = (over: Partial<Deliverables> = {}): Deliverables => ({
  videos_per_creator: 1,
  min_duration_s: 15,
  max_duration_s: 45,
  aspect: "9:16",
  platforms: ["tiktok", "instagram"],
  regions: ["US"],
  require_face: true,
  music_policy: "commercial_library",
  ai_policy: "allowed_disclosed",
  ...over,
});

/** A clean 24 second video: hook, disclosure, app reveal, demo, offer and one CTA near the end. */
export const goodTranscript = (): TranscriptSegment[] => [
  { t_start_ms: 300, t_end_ms: 2400, text: "I was wrong about photo editing apps." },
  { t_start_ms: 2600, t_end_ms: 5000, text: "This is a paid partnership with Lumi." },
  { t_start_ms: 5200, t_end_ms: 9500, text: "Watch this, I just upload one selfie and Lumi does the rest." },
  { t_start_ms: 9800, t_end_ms: 15_000, text: "Look at that result, a studio headshot in under a minute." },
  { t_start_ms: 15_300, t_end_ms: 19_800, text: "And you get a seven day free trial, no card needed." },
  { t_start_ms: 20_100, t_end_ms: 23_500, text: "Try Lumi free with the link in my bio." },
];

export const goodOnScreen = (): OnScreenText[] => [
  { t_start_ms: 600, t_end_ms: 3000, text: "I was wrong about photo editing apps", in_safe_zone: true },
  { t_start_ms: 2600, t_end_ms: 5200, text: "#ad Paid partnership with Lumi", in_safe_zone: true },
  { t_start_ms: 21_000, t_end_ms: 24_000, text: "Lumi - try it free", in_safe_zone: true },
];

export const qaInput = (over: Partial<QaInput> = {}): QaInput => ({
  transcript: goodTranscript(),
  on_screen_text: goodOnScreen(),
  duration_ms: 24_000,
  width: 1080,
  height: 1920,
  caption: "Studio headshots from a selfie #ad Paid partnership with Lumi lumi.example/r/maya",
  brief: brief(),
  deliverables: deliverables(),
  brand_name: "Lumi",
  app_features: ["headshot", "selfie"],
  competitor_names: ["PicPerfect"],
  music: { detected: true, kind: "commercial_library" },
  ai_content: { generated: false, labelled: false },
  watermark_detected: false,
  moderation_flags: [],
  phash: "a1b2c3d4e5f60718",
  known_hashes: [{ id: "sub_0001", phash: "ffffffffffffffff" }],
  ...over,
});

export const passChecks = (): QaCheck[] =>
  (["disclosure_audio", "disclosure_onscreen", "banned_claims", "music_licence", "ai_content", "duplicate", "watermark", "aspect_ratio", "length", "resolution", "safe_zone", "audio_clarity"] as const).map((check) => ({
    check,
    result: "pass" as const,
    message: `${check} ok`,
    blocks_settlement: false,
  }));
