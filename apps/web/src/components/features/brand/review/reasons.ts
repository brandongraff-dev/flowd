import { REASON_CODE_INFO, REASON_CODES, type Brief, type FeedbackCategory, type QaCheckType, type ReasonCode, type ScoreItemId, type VideoAnalysis } from "@/lib/contract/types";
import type { QaFlag } from "./queue-data";

/** The reasons reviewers reach for most, in the order they are listed when nothing was flagged. */
const COMMON: readonly ReasonCode[] = [
  "missing_disclosure",
  "app_not_shown_early",
  "hook_too_late",
  "missing_required_beat",
  "offer_not_stated",
  "banned_claim",
  "off_brief",
  "music_not_licensed",
  "audio_unclear",
  "low_video_quality",
  "wrong_format",
  "duplicate_content",
];

export type DecisionUse = "reject" | "changes";

/** A reason can reject unless it is Ops only; it can request changes only when it applies to both. */
export function reasonAllowed(code: ReasonCode, use: DecisionUse): boolean {
  const applies = REASON_CODE_INFO[code].applies_to;
  return use === "reject" ? applies !== "admin" : applies === "both";
}

export interface RankedReason {
  code: ReasonCode;
  /** The automated check that flagged it on this video. */
  flagged_by?: QaCheckType;
}

/**
 * Reasons for this video, best first: the ones matching a failed or warned QA check lead (so a missing spoken disclosure puts
 * "Disclosure missing" at number 1), then the common ones, then the rest. Numbered 1 to 9 in the dialog.
 */
export function rankReasons(flags: readonly QaFlag[], use: DecisionUse): RankedReason[] {
  const out: RankedReason[] = [];
  const seen = new Set<ReasonCode>();
  const push = (code: ReasonCode, flaggedBy?: QaCheckType): void => {
    if (seen.has(code) || !reasonAllowed(code, use)) return;
    seen.add(code);
    out.push({ code, ...(flaggedBy ? { flagged_by: flaggedBy } : {}) });
  };
  for (const flag of flags) {
    for (const code of REASON_CODES) if (REASON_CODE_INFO[code].qa_check === flag.check) push(code, flag.check);
  }
  for (const code of COMMON) push(code);
  for (const code of REASON_CODES) push(code);
  return out;
}

export interface BriefLine {
  value: string;
  label: string;
}

/** Requirements the brief actually states, as lines a rejection can quote ("Required beat: App reveal"). */
export function briefRequirements(brief: Brief): BriefLine[] {
  const lines: BriefLine[] = [];
  for (const beat of brief.beats) if (beat.required) lines.push({ value: `Required beat: ${beat.label}`, label: `Required beat: ${beat.label}` });
  if (brief.offer_line) lines.push({ value: `Offer: ${brief.offer_line}`, label: `Offer: ${brief.offer_line}` });
  lines.push({ value: `Call to action: ${brief.cta}`, label: `Call to action: ${brief.cta}` });
  lines.push({ value: `Disclosure: ${brief.disclosure_text}`, label: `Disclosure: ${brief.disclosure_text}` });
  for (const line of brief.dos.slice(0, 4)) lines.push({ value: `Do: ${line}`, label: `Do: ${line}` });
  for (const claim of brief.banned_claims.slice(0, 3)) lines.push({ value: `Banned claim: ${claim}`, label: `Banned claim: ${claim}` });
  return lines;
}

/** The note category a reason belongs to, so a note picks it up when a reason is chosen. */
export function categoryOf(code: ReasonCode): FeedbackCategory {
  return REASON_CODE_INFO[code].category;
}

/** Plain names for the 14 automated QA checks. */
export const QA_LABEL: Record<QaCheckType, string> = {
  disclosure_audio: "Spoken disclosure",
  disclosure_onscreen: "On-screen disclosure",
  music_licence: "Music licence",
  banned_claims: "Banned claims",
  ai_content: "AI-generated content",
  duplicate: "Duplicate check",
  watermark: "Watermark check",
  brief_beats: "Brief beats",
  safe_zone: "Safe zones",
  aspect_ratio: "Aspect ratio",
  length: "Length",
  resolution: "Resolution",
  audio_clarity: "Audio clarity",
  moderation: "Moderation",
};

/** The note category a QA finding belongs to, so "Note it" lands in the right drawer. */
export function categoryForCheck(check: QaCheckType): FeedbackCategory {
  switch (check) {
    case "disclosure_audio":
    case "disclosure_onscreen":
      return "disclosure";
    case "music_licence":
    case "audio_clarity":
      return "audio";
    case "banned_claims":
      return "claims";
    case "brief_beats":
      return "offer";
    case "safe_zone":
      return "captions";
    case "aspect_ratio":
    case "length":
    case "resolution":
      return "pacing";
    default:
      return "brand";
  }
}

/** The note category of a Hook or Flow Score checklist line. */
export function categoryForScoreItem(id: ScoreItemId): FeedbackCategory {
  switch (id) {
    case "speech_starts_fast":
    case "audio_clear":
      return "audio";
    case "captions_safe_zone":
      return "captions";
    case "required_beats":
    case "single_cta_win_state":
      return "offer";
    case "disclosure":
      return "disclosure";
    case "length_ok":
      return "pacing";
    case "format_fit":
      return "brand";
    default:
      return "hook";
  }
}

/** Where in the video a checklist line points, when it points at a moment (so its reason can seek there). */
export function scoreItemTime(id: ScoreItemId, a: VideoAnalysis): number | undefined {
  const hook = a.hook;
  switch (id) {
    case "hook_lands_2s":
    case "proven_hook_type":
    case "hook_score":
      return hook.lands_at_ms;
    case "onscreen_text_matches":
      return hook.caption_at_ms;
    case "face_early":
      return hook.face_at_ms;
    case "app_visible_3s":
    case "app_visible_early":
      return hook.app_at_ms;
    case "pattern_interrupt":
      return a.scenes[0]?.t_end_ms !== undefined ? Math.min(a.scenes[0].t_end_ms, 1500) : undefined;
    case "speech_starts_fast":
      return a.transcript[0]?.t_start_ms;
    case "disclosure":
      return a.checks.find((c) => (c.check === "disclosure_audio" || c.check === "disclosure_onscreen") && c.evidence?.t_ms !== undefined)?.evidence?.t_ms;
    case "audio_clear":
      return a.checks.find((c) => c.check === "audio_clarity")?.evidence?.t_ms;
    case "single_cta_win_state":
      return [...a.beats].reverse().find((b) => b.found && b.t_ms !== undefined && (b.beat === "cta" || b.beat === "win_state"))?.t_ms;
    default:
      return undefined;
  }
}
