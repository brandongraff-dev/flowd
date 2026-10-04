/**
 * Auto-QA: automated checks over a video's transcript and metadata, before a human looks.
 *
 * Required beats, spoken and on-screen disclosure, banned claims, competitor mentions, music licence, AI labels, duplicates by
 * perceptual-hash distance, watermarks, safe zones, aspect, length, resolution and audio clarity. Each check returns pass, warn or
 * fail with plain-English text, evidence (a timecode, a transcript line, a QA check) and the reason code a rejection would use.
 *
 * A missing disclosure blocks settlement (FTC: the disclosure must be in the video itself, audio and visual). Nothing else does.
 * Rejections are about the video, never the person.
 */

import {
  CONSTANTS,
  type BeatHit,
  type BeatId,
  type Brief,
  type ComplianceCheckItem,
  type ComplianceResult,
  type Deliverables,
  type Evidence,
  type OnScreenText,
  type QaCheck,
  type QaCheckType,
  type QaResult,
  type ReasonCode,
  type TranscriptSegment,
} from "@/lib/contract/types";
import { callsToAction, containment, contentTokens, findPhrase, normalizeText, timecode, tokenize } from "./text";

// ── input and output ───────────────────────────────────────────────────────────────────────────

export type MusicKind = "original" | "commercial_library" | "trending_sound" | "unknown";

export interface QaInput {
  transcript: readonly TranscriptSegment[];
  on_screen_text: readonly OnScreenText[];
  duration_ms: number;
  width: number;
  height: number;
  /** The post caption, when there is one (for the caption disclosure). */
  caption?: string;
  brief: Pick<Brief, "beats" | "banned_claims" | "disclosure_text" | "offer_line" | "cta" | "hashtags" | "mentions">;
  deliverables: Pick<Deliverables, "min_duration_s" | "max_duration_s" | "aspect" | "music_policy" | "ai_policy">;
  /** Hits already found by the vision model. When absent, a transcript heuristic stands in. */
  beats?: readonly BeatHit[];
  /** The brand or app name the creator should say (for the app-reveal beat and the disclosure wording). */
  brand_name: string;
  /** Feature names creators can demo (the key-feature beat). */
  app_features?: readonly string[];
  /** Apps that must not be shown or named. */
  competitor_names?: readonly string[];
  music?: { detected: boolean; kind?: MusicKind };
  ai_content?: { generated: boolean; labelled: boolean };
  watermark_detected?: boolean;
  moderation_flags?: readonly string[];
  audio?: { snr_db?: number; clipping?: boolean };
  /** 16 hex characters: the perceptual hash of this video. */
  phash?: string;
  /** Hashes of other videos to compare against (other creators' and this creator's own earlier posts). */
  known_hashes?: readonly { id: string; phash: string; creator_id?: string }[];
}

/** A QA check with the extras the review queue needs: the reason code a rejection would carry, and a fix. */
export interface QaFinding extends QaCheck {
  reason_code?: ReasonCode;
  fix?: string;
}

export interface CompetitorMention {
  name: string;
  t_ms?: number;
  source: "transcript" | "on_screen" | "caption";
  excerpt: string;
}

export interface DuplicateMatch {
  id: string;
  creator_id?: string;
  distance: number;
  exact: boolean;
}

export interface QaReport {
  /** One finding per check that ran, in a stable order. */
  findings: QaFinding[];
  /** The same findings in the contract's QaCheck shape (extra fields dropped). */
  checks: QaCheck[];
  pass: number;
  warn: number;
  fail: number;
  /** True when a disclosure failed: settlement waits until it is fixed or waived with a logged reason. */
  blocks_settlement: boolean;
  /** Reason codes that apply to failed or warned checks, most serious first, without duplicates. */
  reason_codes: ReasonCode[];
  beats: BeatHit[];
  competitors: CompetitorMention[];
  duplicates: DuplicateMatch[];
}

// ── disclosure ─────────────────────────────────────────────────────────────────────────────────

/** Spoken ways of saying a video is an ad. */
const SPOKEN_DISCLOSURE: readonly RegExp[] = [
  /\bhashtag ad\b/,
  /\b(?:this|it) is (?:an? )?(?:paid )?(?:ad|advert|advertisement|sponsored|partnership|promotion)\b/,
  /\b(?:this|it)'?s (?:an? )?(?:paid )?(?:ad|advert|advertisement|sponsored|partnership|promotion)\b/,
  /\bpaid (?:partnership|promotion|ad|advertisement)\b/,
  /\bsponsored (?:by|content|post|video)\b/,
  /\b(?:i'?m|i am|we are|we're) (?:partnering|partnered|working) with\b/,
  /\bpartnered with\b/,
  /\bin partnership with\b/,
  /\bthanks to .{1,30} for (?:sponsoring|partnering)\b/,
];

/** Written ways of marking a video as an ad. */
const WRITTEN_DISCLOSURE: readonly RegExp[] = [/(^|[^a-z0-9])#ad(?![a-z0-9])/, /^ad(?:$|[\s:.|])/, /paid partnership/, /\bsponsored\b/, /#paidpartnership/];

/** Evidence pointing at a QA check. */
const qaEvidence = (check: QaCheckType, t_ms?: number, excerpt?: string): Evidence => ({ kind: "qa_check", ref: check, ...(excerpt ? { excerpt } : {}), ...(t_ms !== undefined ? { t_ms } : {}) });

/** The first transcript segment that contains a spoken disclosure, or null. */
export function findSpokenDisclosure(transcript: readonly TranscriptSegment[]): TranscriptSegment | null {
  for (const seg of transcript) {
    const text = normalizeText(seg.text);
    if (SPOKEN_DISCLOSURE.some((re) => re.test(text))) return seg;
  }
  // A disclosure that is split across two segments ("this is a" / "paid partnership")
  for (let i = 0; i + 1 < transcript.length; i += 1) {
    const joined = normalizeText(`${transcript[i].text} ${transcript[i + 1].text}`);
    if (SPOKEN_DISCLOSURE.some((re) => re.test(joined))) return transcript[i];
  }
  return null;
}

/** The first on-screen text that carries a written disclosure, or null. */
export function findWrittenDisclosure(texts: readonly OnScreenText[]): OnScreenText | null {
  for (const t of texts) {
    const text = normalizeText(t.text);
    if (WRITTEN_DISCLOSURE.some((re) => re.test(text))) return t;
  }
  return null;
}

const MIN_ONSCREEN_DISCLOSURE_MS = 2000;

/** Spoken disclosure: pass when said in the first half, warn when it comes late, fail (and block settlement) when it is never said. */
export function checkDisclosureAudio(input: Pick<QaInput, "transcript" | "duration_ms">): QaFinding {
  const seg = findSpokenDisclosure(input.transcript);
  if (!seg) {
    return {
      check: "disclosure_audio",
      result: "fail",
      message: "#ad needs to be spoken and shown on screen. No spoken disclosure was found.",
      evidence: qaEvidence("disclosure_audio"),
      blocks_settlement: true,
      reason_code: "missing_disclosure",
      fix: 'Say "this is a paid partnership" near the start.',
    };
  }
  const late = input.duration_ms > 0 && seg.t_start_ms > input.duration_ms * 0.5;
  return {
    check: "disclosure_audio",
    result: late ? "warn" : "pass",
    message: late ? `The spoken disclosure comes late (${timecode(seg.t_start_ms)}). Say it in the first half.` : `Spoken disclosure at ${timecode(seg.t_start_ms)}.`,
    evidence: { kind: "transcript", ref: timecode(seg.t_start_ms), excerpt: seg.text, t_ms: seg.t_start_ms },
    blocks_settlement: false,
    ...(late ? { reason_code: "missing_disclosure" as const, fix: "Move the disclosure line into the first half of the video." } : {}),
  };
}

/** On-screen disclosure: pass at 2 seconds or more, warn when shorter, fail (and block settlement) when absent. */
export function checkDisclosureOnScreen(input: Pick<QaInput, "on_screen_text">): QaFinding {
  const t = findWrittenDisclosure(input.on_screen_text);
  if (!t) {
    return {
      check: "disclosure_onscreen",
      result: "fail",
      message: "#ad needs to be spoken and shown on screen. No on-screen disclosure was found.",
      evidence: qaEvidence("disclosure_onscreen"),
      blocks_settlement: true,
      reason_code: "missing_disclosure",
      fix: "Keep #ad on screen for at least 2 seconds.",
    };
  }
  const visible = t.t_end_ms - t.t_start_ms;
  const short = visible < MIN_ONSCREEN_DISCLOSURE_MS;
  return {
    check: "disclosure_onscreen",
    result: short ? "warn" : "pass",
    message: short ? `#ad is on screen for ${(visible / 1000).toFixed(1)}s. Keep it up for 2 seconds.` : `On-screen disclosure at ${timecode(t.t_start_ms)}.`,
    evidence: { kind: "timecode", ref: timecode(t.t_start_ms), excerpt: t.text, t_ms: t.t_start_ms },
    blocks_settlement: false,
    ...(short ? { reason_code: "missing_disclosure" as const, fix: "Keep #ad on screen for 2 seconds." } : {}),
  };
}

/** The caption must carry #ad and the brand wording ("Paid partnership with Lumi"). Returns the compliance item for the post-level audit. */
export function checkCaptionDisclosure(caption: string | undefined, brandName: string): ComplianceCheckItem {
  if (caption === undefined || caption.trim() === "") {
    return { type: "caption_disclosure", result: "fail", message: "The caption is empty. It needs #ad and the brand wording.", blocks_settlement: true };
  }
  const text = normalizeText(caption);
  const hasAd = /(^|[^a-z0-9])#ad(?![a-z0-9])/.test(text) || /#paidpartnership|#sponsored/.test(text);
  const hasBrand = text.includes(normalizeText(brandName));
  if (hasAd && hasBrand) return { type: "caption_disclosure", result: "pass", message: `Caption carries #ad and ${brandName}.`, blocks_settlement: false };
  if (hasAd) return { type: "caption_disclosure", result: "warn", message: `Caption has #ad but not the brand wording ("Paid partnership with ${brandName}").`, blocks_settlement: false };
  return { type: "caption_disclosure", result: "fail", message: `The caption has no #ad. Add "#ad Paid partnership with ${brandName}".`, blocks_settlement: true };
}

// ── claims, competitors, duplicates ────────────────────────────────────────────────────────────

/** Every banned claim from the brief that appears in the transcript, on-screen text or caption. */
export function findBannedClaims(
  input: Pick<QaInput, "transcript" | "on_screen_text" | "caption" | "brief">,
): { claim: string; source: "transcript" | "on_screen" | "caption"; t_ms?: number; excerpt: string }[] {
  const out: { claim: string; source: "transcript" | "on_screen" | "caption"; t_ms?: number; excerpt: string }[] = [];
  for (const claim of input.brief.banned_claims) {
    const seg = input.transcript.find((s) => findPhrase(s.text, [claim]));
    if (seg) out.push({ claim, source: "transcript", t_ms: seg.t_start_ms, excerpt: seg.text });
    const ost = input.on_screen_text.find((s) => findPhrase(s.text, [claim]));
    if (ost) out.push({ claim, source: "on_screen", t_ms: ost.t_start_ms, excerpt: ost.text });
    if (input.caption && findPhrase(input.caption, [claim])) out.push({ claim, source: "caption", excerpt: input.caption });
  }
  return out;
}

/** Competitor names spoken, shown or captioned. */
export function findCompetitors(input: Pick<QaInput, "transcript" | "on_screen_text" | "caption" | "competitor_names">): CompetitorMention[] {
  const names = input.competitor_names ?? [];
  const out: CompetitorMention[] = [];
  for (const name of names) {
    const seg = input.transcript.find((s) => findPhrase(s.text, [name]));
    if (seg) out.push({ name, t_ms: seg.t_start_ms, source: "transcript", excerpt: seg.text });
    const ost = input.on_screen_text.find((s) => findPhrase(s.text, [name]));
    if (ost) out.push({ name, t_ms: ost.t_start_ms, source: "on_screen", excerpt: ost.text });
    if (input.caption && findPhrase(input.caption, [name])) out.push({ name, source: "caption", excerpt: input.caption });
  }
  return out;
}

const HEX16 = /^[0-9a-f]{16}$/i;

/** True for a 16-character hex perceptual hash. */
export const isValidPhash = (hash: string): boolean => HEX16.test(hash);

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Hamming distance between two perceptual hashes (number of differing bits out of 64). Throws on a malformed hash. */
export function phashDistance(a: string, b: string): number {
  if (!isValidPhash(a) || !isValidPhash(b)) throw new Error("phashDistance: hashes must be 16 hex characters");
  let bits = 0;
  for (let i = 0; i < 16; i += 1) bits += NIBBLE_BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return bits;
}

/**
 * Videos within `max` bits of this one (default 6, CONSTANTS.fraud.duplicate_phash_max_distance), nearest first. Malformed hashes are skipped.
 */
export function findDuplicates(phash: string, known: readonly { id: string; phash: string; creator_id?: string }[], max: number = CONSTANTS.fraud.duplicate_phash_max_distance): DuplicateMatch[] {
  if (!isValidPhash(phash)) return [];
  const out: DuplicateMatch[] = [];
  for (const k of known) {
    if (!isValidPhash(k.phash)) continue;
    const distance = phashDistance(phash, k.phash);
    if (distance <= max) out.push({ id: k.id, creator_id: k.creator_id, distance, exact: distance === 0 });
  }
  return out.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

// ── audio ──────────────────────────────────────────────────────────────────────────────────────

/** Dead-air gaps between spoken segments longer than `minMs` (default 1,000 ms). Leading and trailing silence are not counted here. */
export function deadAirGaps(transcript: readonly TranscriptSegment[], minMs = 1000): { start_ms: number; end_ms: number; length_ms: number }[] {
  const sorted = [...transcript].sort((a, b) => a.t_start_ms - b.t_start_ms);
  const out: { start_ms: number; end_ms: number; length_ms: number }[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].t_start_ms - sorted[i - 1].t_end_ms;
    if (gap > minMs) out.push({ start_ms: sorted[i - 1].t_end_ms, end_ms: sorted[i].t_start_ms, length_ms: gap });
  }
  return out;
}

// ── beats ──────────────────────────────────────────────────────────────────────────────────────

const PROBLEM_WORDS = /\b(?:struggl|hate|hated|tired of|annoying|problem|can'?t|cannot|never|why (?:is|do|does|can'?t)|used to|so (?:slow|hard|long)|stuck|waste)/;
const PAYOFF_WORDS = /\b(?:result|results|now|after|finally|turned out|boom|look at|here'?s (?:what|the)|done|ready|perfect|love|wow|worked)\b/;
const REACTION_WORDS = /\b(?:wow|omg|oh my|no way|what|insane|crazy|unreal|are you kidding|i can'?t believe)\b/;
const DEMO_WORDS = /\b(?:watch|look|see how|here'?s|tap|just|open|upload|type|press|swipe|scan|record|then it|and it)\b/;
const OFFER_WORDS = /\b(?:free trial|free for|try (?:it )?free|\d+ days? free|% off|first (?:week|month) free|no card|cancel anytime|no payment)\b/;

/**
 * A day-one stand-in for the vision model: finds each beat of the brief from the transcript and on-screen text. A beat that is in the
 * brief but not detectable from text alone (a pure visual) is reported as not found, so a human decides. When the vision model has
 * already produced hits, pass them as `beats` and this is not used.
 */
export function detectBeats(input: Pick<QaInput, "transcript" | "on_screen_text" | "brief" | "brand_name" | "app_features" | "duration_ms">): BeatHit[] {
  const { transcript, on_screen_text, brief } = input;
  const brand = normalizeText(input.brand_name);
  const segs = [...transcript].sort((a, b) => a.t_start_ms - b.t_start_ms);
  const endCut = input.duration_ms * 0.7;
  const firstSeg = (re: RegExp, after = 0): TranscriptSegment | undefined => segs.find((s) => s.t_start_ms >= after && re.test(normalizeText(s.text)));
  const offerTokens = brief.offer_line ? contentTokens(brief.offer_line) : [];
  const ctaTokens = contentTokens(brief.cta);

  const find = (beat: BeatId): { found: boolean; t_ms?: number } => {
    switch (beat) {
      case "hook":
        return segs.length > 0 && segs[0].t_start_ms <= 3000 ? { found: true, t_ms: segs[0].t_start_ms } : { found: false };
      case "problem": {
        const s = firstSeg(PROBLEM_WORDS);
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "app_reveal": {
        const s = segs.find((x) => brand && findPhrase(x.text, [input.brand_name]));
        const o = on_screen_text.find((x) => brand && findPhrase(x.text, [input.brand_name]));
        const t = [s?.t_start_ms, o?.t_start_ms].filter((v): v is number => v !== undefined);
        return t.length ? { found: true, t_ms: Math.min(...t) } : { found: false };
      }
      case "demo": {
        const s = firstSeg(DEMO_WORDS, 1500);
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "key_feature": {
        const features = input.app_features ?? [];
        const s = segs.find((x) => features.some((f) => findPhrase(x.text, [f])));
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "payoff":
      case "proof": {
        const s = firstSeg(PAYOFF_WORDS, 2000);
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "win_state": {
        const s = firstSeg(PAYOFF_WORDS, endCut * 0.8);
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "reaction": {
        const s = firstSeg(REACTION_WORDS);
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "offer": {
        const s = segs.find((x) => OFFER_WORDS.test(normalizeText(x.text)) || (offerTokens.length > 0 && containment(offerTokens, tokenize(x.text)) >= 0.6));
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "cta": {
        const s = segs.find((x) => x.t_start_ms >= endCut && (callsToAction(x.text).length > 0 || (ctaTokens.length > 0 && containment(ctaTokens, tokenize(x.text)) >= 0.6)));
        return s ? { found: true, t_ms: s.t_start_ms } : { found: false };
      }
      case "end_card": {
        const o = on_screen_text.find((x) => x.t_start_ms >= endCut && ((brand && findPhrase(x.text, [input.brand_name])) || /\.[a-z]{2,}\b|app store|link in bio/i.test(x.text)));
        return o ? { found: true, t_ms: o.t_start_ms } : { found: false };
      }
    }
  };

  return brief.beats.map((b) => {
    const r = find(b.beat);
    return { beat: b.beat, required: b.required, found: r.found, ...(r.t_ms !== undefined ? { t_ms: r.t_ms } : {}) };
  });
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────────

/** Parses "9:16" into a width / height ratio. Falls back to 9:16 for anything unreadable. */
export function aspectRatioOf(aspect: string): number {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  return m ? Number(m[1]) / Number(m[2]) : 9 / 16;
}

function checkBeats(beats: readonly BeatHit[]): QaFinding {
  const required = beats.filter((b) => b.required);
  const missing = required.filter((b) => !b.found);
  if (required.length === 0 || missing.length === 0) {
    return { check: "brief_beats", result: "pass", message: required.length === 0 ? "The brief has no required beats." : `All ${required.length} required beats found.`, blocks_settlement: false };
  }
  const first = missing[0];
  const label = first.beat.replace("_", " ");
  return {
    check: "brief_beats",
    result: "fail",
    message: `${required.length - missing.length} of ${required.length} required beats found. Missing: ${missing.map((m) => m.beat.replace("_", " ")).join(", ")}.`,
    evidence: { kind: "brief_requirement", ref: `beat:${first.beat}`, excerpt: `Required beat: ${label}` },
    blocks_settlement: false,
    reason_code: first.beat === "app_reveal" ? "app_not_shown_early" : first.beat === "offer" ? "offer_not_stated" : "missing_required_beat",
    fix: "Add the missing beat from the shot checklist, then re-check the score.",
  };
}

function checkBannedClaims(input: QaInput, competitors: readonly CompetitorMention[]): QaFinding {
  const claims = findBannedClaims(input);
  if (claims.length > 0) {
    const c = claims[0];
    return {
      check: "banned_claims",
      result: "fail",
      message: `A banned claim was ${c.source === "caption" ? "written in the caption" : c.source === "on_screen" ? "shown on screen" : "said"}: "${c.claim}".`,
      evidence: { kind: c.source === "transcript" ? "transcript" : "timecode", ref: c.t_ms !== undefined ? timecode(c.t_ms) : "caption", excerpt: c.excerpt, ...(c.t_ms !== undefined ? { t_ms: c.t_ms } : {}) },
      blocks_settlement: false,
      reason_code: "banned_claim",
      fix: "Rephrase using the approved wording in the brief.",
    };
  }
  if (competitors.length > 0) {
    const c = competitors[0];
    return {
      check: "banned_claims",
      result: "warn",
      message: `A competitor is mentioned: ${c.name}${c.t_ms !== undefined ? ` at ${timecode(c.t_ms)}` : ""}.`,
      evidence: { kind: c.source === "transcript" ? "transcript" : "timecode", ref: c.t_ms !== undefined ? timecode(c.t_ms) : "caption", excerpt: c.excerpt, ...(c.t_ms !== undefined ? { t_ms: c.t_ms } : {}) },
      blocks_settlement: false,
      reason_code: "competitor_shown",
      fix: "Crop or re-record the section.",
    };
  }
  return { check: "banned_claims", result: "pass", message: "No banned claims or competitor names found.", blocks_settlement: false };
}

function checkMusic(input: QaInput): QaFinding {
  const policy = input.deliverables.music_policy;
  const music = input.music;
  if (!music || !music.detected || music.kind === "original") return { check: "music_licence", result: "pass", message: music?.detected ? "Original music." : "No music detected.", blocks_settlement: false };
  if (music.kind === "commercial_library") {
    return policy === "original_only"
      ? { check: "music_licence", result: "fail", message: "This bounty allows original music only. Library music was found.", blocks_settlement: false, reason_code: "music_not_licensed", fix: "Swap it for your own sound or remove the music." }
      : { check: "music_licence", result: "pass", message: "Commercial Music Library track.", blocks_settlement: false };
  }
  if (music.kind === "trending_sound") {
    return { check: "music_licence", result: "fail", message: "A trending sound was found. It is not licensed for ads.", blocks_settlement: false, reason_code: "music_not_licensed", fix: "Swap it for a commercial-library track or remove the music." };
  }
  return { check: "music_licence", result: "warn", message: "Music was detected but its licence is unknown. Use a commercial-library track.", blocks_settlement: false, reason_code: "music_not_licensed", fix: "Swap it for a commercial-library track or remove the music." };
}

function checkAi(input: QaInput): QaFinding {
  const ai = input.ai_content;
  if (!ai || !ai.generated) return { check: "ai_content", result: "pass", message: "No AI-generated media flagged.", blocks_settlement: false };
  if (input.deliverables.ai_policy === "not_allowed") {
    return { check: "ai_content", result: "fail", message: "This bounty does not allow AI-generated media.", blocks_settlement: false, reason_code: "other_requirement", fix: "Use your own footage and screen recordings." };
  }
  if (!ai.labelled) {
    return { check: "ai_content", result: "fail", message: "AI-generated media needs a visible AI label.", blocks_settlement: false, reason_code: "ai_content_undisclosed", fix: 'Add the "AI-generated" label on screen.' };
  }
  return { check: "ai_content", result: "pass", message: "AI-generated media is labelled.", blocks_settlement: false };
}

function checkDuplicate(input: QaInput, matches: readonly DuplicateMatch[]): QaFinding {
  if (!input.phash || !isValidPhash(input.phash)) return { check: "duplicate", result: "pass", message: "No fingerprint to compare yet.", blocks_settlement: false };
  if (matches.length === 0) return { check: "duplicate", result: "pass", message: "No matching video found.", blocks_settlement: false };
  const m = matches[0];
  return {
    check: "duplicate",
    result: "fail",
    message: m.exact ? `An identical video was already submitted (${m.id}).` : `This video closely matches ${m.id} (distance ${m.distance} of ${CONSTANTS.fraud.duplicate_phash_max_distance}).`,
    evidence: qaEvidence("duplicate", undefined, `${m.id}, distance ${m.distance}`),
    blocks_settlement: false,
    reason_code: "duplicate_content",
    fix: "Film a new original take.",
  };
}

function checkAspect(input: QaInput): QaFinding {
  const target = aspectRatioOf(input.deliverables.aspect);
  const actual = input.width / input.height;
  const ok = Math.abs(actual - target) <= 0.02;
  return ok
    ? { check: "aspect_ratio", result: "pass", message: `${input.width}x${input.height} (${input.deliverables.aspect}).`, blocks_settlement: false }
    : { check: "aspect_ratio", result: "fail", message: `The video is ${input.width}x${input.height}, not ${input.deliverables.aspect}.`, blocks_settlement: false, reason_code: "wrong_format", fix: "Re-export at 1080x1920." };
}

function checkLength(input: QaInput): QaFinding {
  const s = input.duration_ms / 1000;
  const { min_duration_s: min, max_duration_s: max } = input.deliverables;
  if (s >= min && s <= max) return { check: "length", result: "pass", message: `${s.toFixed(0)}s, inside the ${min} to ${max} second window.`, blocks_settlement: false };
  return {
    check: "length",
    result: "fail",
    message: `The video is ${s.toFixed(0)}s. This bounty asks for ${min} to ${max} seconds.`,
    blocks_settlement: false,
    reason_code: "wrong_format",
    fix: `Keep it between ${min} and ${max} seconds.`,
  };
}

function checkResolution(input: QaInput): QaFinding {
  const shortSide = Math.min(input.width, input.height);
  if (shortSide >= CONSTANTS.studio.width) return { check: "resolution", result: "pass", message: `${input.width}x${input.height}.`, blocks_settlement: false };
  if (shortSide >= 720) return { check: "resolution", result: "warn", message: `${input.width}x${input.height} is under 1080p. It will look soft in ads.`, blocks_settlement: false, reason_code: "low_video_quality", fix: "Film at 1080x1920." };
  return { check: "resolution", result: "fail", message: `${input.width}x${input.height} is too low resolution.`, blocks_settlement: false, reason_code: "low_video_quality", fix: "Film near a window, hold steady, and export at 1080x1920." };
}

function checkAudio(input: QaInput): QaFinding {
  const gaps = deadAirGaps(input.transcript);
  const snr = input.audio?.snr_db;
  const clipping = input.audio?.clipping ?? false;
  if (gaps.length >= 3 || (snr !== undefined && snr < 12)) {
    return { check: "audio_clarity", result: "fail", message: snr !== undefined && snr < 12 ? "The speech is hard to hear over background noise." : `${gaps.length} dead-air gaps over 1 second.`, blocks_settlement: false, reason_code: "audio_unclear", fix: "Move closer to the mic, cut silences, and re-export." };
  }
  if (gaps.length > 0 || clipping || (snr !== undefined && snr < 20)) {
    const first = gaps[0];
    return {
      check: "audio_clarity",
      result: "warn",
      message: first ? `A ${(first.length_ms / 1000).toFixed(1)}s pause at ${timecode(first.start_ms)}.` : clipping ? "The audio clips (too loud)." : "Some background noise.",
      ...(first ? { evidence: { kind: "timecode" as const, ref: timecode(first.start_ms), t_ms: first.start_ms } } : {}),
      blocks_settlement: false,
      reason_code: "audio_unclear",
      fix: "Cut the silences and keep the mic level steady.",
    };
  }
  return { check: "audio_clarity", result: "pass", message: "Clear audio, no dead air over 1 second.", blocks_settlement: false };
}

function checkSafeZone(input: QaInput): QaFinding {
  const outside = input.on_screen_text.filter((t) => !t.in_safe_zone);
  if (outside.length === 0) return { check: "safe_zone", result: "pass", message: "All text is inside the platform safe zones.", blocks_settlement: false };
  const first = outside[0];
  return {
    check: "safe_zone",
    result: "warn",
    message: `${outside.length} text overlay${outside.length === 1 ? " is" : "s are"} outside the safe zones, first at ${timecode(first.t_start_ms)}.`,
    evidence: { kind: "timecode", ref: timecode(first.t_start_ms), excerpt: first.text, t_ms: first.t_start_ms },
    blocks_settlement: false,
    fix: "Move captions above the platform UI.",
  };
}

function checkWatermark(input: QaInput): QaFinding {
  return input.watermark_detected
    ? { check: "watermark", result: "fail", message: "Another app's watermark or logo is visible.", blocks_settlement: false, reason_code: "watermark_present", fix: "Re-export your screen recording without overlays." }
    : { check: "watermark", result: "pass", message: "No watermark found.", blocks_settlement: false };
}

function checkModeration(input: QaInput): QaFinding {
  const flags = input.moderation_flags ?? [];
  return flags.length > 0
    ? { check: "moderation", result: "fail", message: `Brand-safety flags: ${flags.join(", ")}.`, blocks_settlement: false, reason_code: "brand_safety", fix: "Review the do and don't list in the brief." }
    : { check: "moderation", result: "pass", message: "Nothing flagged.", blocks_settlement: false };
}

const SEVERITY: Record<QaResult, number> = { fail: 2, warn: 1, pass: 0 };

/**
 * Runs every QA check over a video and its metadata.
 *
 * - `blocks_settlement` is true only when a disclosure (spoken or on-screen) is missing.
 * - `reason_codes` lists the codes a rejection or request-changes would carry, so the review queue can pre-fill them.
 * - The result is deterministic: the same input gives the same report.
 */
export function runQa(input: QaInput): QaReport {
  const beats = input.beats ? [...input.beats] : detectBeats(input);
  const competitors = findCompetitors(input);
  const duplicates = input.phash ? findDuplicates(input.phash, input.known_hashes ?? []) : [];
  const findings: QaFinding[] = [
    checkDisclosureAudio(input),
    checkDisclosureOnScreen(input),
    checkBeats(beats),
    checkBannedClaims(input, competitors),
    checkMusic(input),
    checkAi(input),
    checkDuplicate(input, duplicates),
    checkWatermark(input),
    checkSafeZone(input),
    checkAspect(input),
    checkLength(input),
    checkResolution(input),
    checkAudio(input),
    checkModeration(input),
  ];
  const reason_codes: ReasonCode[] = [];
  for (const f of [...findings].sort((a, b) => SEVERITY[b.result] - SEVERITY[a.result])) {
    if (f.result !== "pass" && f.reason_code && !reason_codes.includes(f.reason_code)) reason_codes.push(f.reason_code);
  }
  return {
    findings,
    checks: findings.map(({ check, result, message, evidence, blocks_settlement, waived_by_user_id }) => ({
      check,
      result,
      message,
      blocks_settlement,
      ...(evidence ? { evidence } : {}),
      ...(waived_by_user_id ? { waived_by_user_id } : {}),
    })),
    pass: findings.filter((f) => f.result === "pass").length,
    warn: findings.filter((f) => f.result === "warn").length,
    fail: findings.filter((f) => f.result === "fail").length,
    blocks_settlement: findings.some((f) => f.blocks_settlement && f.result === "fail"),
    reason_codes,
    beats,
    competitors,
    duplicates,
  };
}

/** True when every check passed (what "approve-if-clean" and auto-approve rules mean by clean). */
export const isClean = (report: Pick<QaReport, "warn" | "fail">): boolean => report.warn === 0 && report.fail === 0;

// ── post-level compliance audit ────────────────────────────────────────────────────────────────

export interface PostComplianceInput {
  caption?: string;
  brand_name: string;
  /** The brief's required hashtags and mentions (the tracking-link check also looks here). */
  tracking_link?: string;
  /** Whether the platform's own "paid partnership" label was switched on. */
  platform_label_on?: boolean;
  qa: Pick<QaReport, "checks">;
}

const toCompliance = (c: QaCheck | undefined, type: ComplianceCheckItem["type"], missing: string): ComplianceCheckItem => ({
  type,
  result: c ? c.result : "pending",
  message: c ? c.message : missing,
  ...(c?.evidence ? { evidence: c.evidence } : {}),
  blocks_settlement: c ? c.blocks_settlement && c.result === "fail" : false,
});

/**
 * The post-level audit after a video is posted: one item per ComplianceCheckType (caption, spoken, on-screen, platform label, music, banned claims,
 * AI label, tracking link). A failure blocks settlement until fixed or waived with a logged reason.
 */
export function auditPostCompliance(input: PostComplianceInput): { checks: ComplianceCheckItem[]; overall: ComplianceResult; blocks_settlement: boolean } {
  const byType = (t: QaCheckType): QaCheck | undefined => input.qa.checks.find((c) => c.check === t);
  const link = input.tracking_link ?? "";
  const caption = input.caption ?? "";
  const hasLink = link !== "" && normalizeText(caption).includes(normalizeText(link).replace(/^https?:\/\//, ""));
  const checks: ComplianceCheckItem[] = [
    checkCaptionDisclosure(input.caption, input.brand_name),
    toCompliance(byType("disclosure_audio"), "spoken_disclosure", "Spoken disclosure not checked yet."),
    toCompliance(byType("disclosure_onscreen"), "onscreen_disclosure", "On-screen disclosure not checked yet."),
    input.platform_label_on === undefined
      ? { type: "platform_label", result: "pending", message: "Waiting for the platform's paid-partnership label status.", blocks_settlement: false }
      : { type: "platform_label", result: input.platform_label_on ? "pass" : "warn", message: input.platform_label_on ? "Platform paid-partnership label is on." : "Switch on the platform's paid-partnership label as well. It does not replace the in-video disclosure.", blocks_settlement: false },
    toCompliance(byType("music_licence"), "music_licence", "Music licence not checked yet."),
    toCompliance(byType("banned_claims"), "banned_claims", "Claims not checked yet."),
    toCompliance(byType("ai_content"), "ai_label", "AI label not checked yet."),
    link === ""
      ? { type: "tracking_link", result: "pending", message: "No tracking link issued yet.", blocks_settlement: false }
      : { type: "tracking_link", result: hasLink ? "pass" : "warn", message: hasLink ? "The tracking link is in the caption." : "The tracking link is missing from the caption, so conversions may not be tracked.", blocks_settlement: false },
  ];
  const overall: ComplianceResult = checks.some((c) => c.result === "fail") ? "fail" : checks.some((c) => c.result === "warn") ? "warn" : checks.some((c) => c.result === "pending") ? "pending" : "pass";
  return { checks, overall, blocks_settlement: checks.some((c) => c.blocks_settlement) };
}

// ── review queue ordering ──────────────────────────────────────────────────────────────────────

/** What the review queue sorts on. */
export interface QueueSortable {
  qa_fail: number;
  qa_warn: number;
  flow_points: number;
  submitted_at: string;
}

/**
 * Review queue order: QA flags first (more fails, then more warnings), then Flow Score (lower first, since those need a closer look), then
 * age (oldest first). Returns negative when `a` should come before `b`.
 */
export function compareForReviewQueue(a: QueueSortable, b: QueueSortable): number {
  if (a.qa_fail !== b.qa_fail) return b.qa_fail - a.qa_fail;
  if (a.qa_warn !== b.qa_warn) return b.qa_warn - a.qa_warn;
  if (a.flow_points !== b.flow_points) return a.flow_points - b.flow_points;
  return a.submitted_at < b.submitted_at ? -1 : a.submitted_at > b.submitted_at ? 1 : 0;
}

