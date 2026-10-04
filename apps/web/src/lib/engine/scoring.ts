/**
 * Hook Score, Flow Score and the brief-compliance checklist.
 *
 * Day-one scores are CHECKLIST scores, not predictions: every item is full, half or zero by a published rule, every item carries a
 * plain-English reason with a timecode, and every score is labelled "Checklist score. It gets smarter as bounties settle." until a learned
 * model beats it on held-out apps. A score is never a bare number: it always comes with a band, reasons and one-tap fixes.
 *
 * Hook Score (first 3 seconds, weights sum to 100): hook lands by 2.0 s 20 · on-screen text mirrors the spoken hook 15 · face in the first
 * second 15 · app by 3 s 15 · pattern interrupt 10 · proven hook type 10 · speech starts fast 10 · captions in safe zones 5.
 * Flow Score (whole video, weights sum to 100): Hook Score scaled 30 · required beats 25 · app early 10 · disclosure 10 · length 5 ·
 * safe-zone captions 5 · one CTA and win state 5 · clear audio 5 · format fit 5.
 * Bands: A 85+, B 70 to 84, C 55 to 69, D 40 to 54, E under 40.
 */

import type {
  BeatHit,
  BeatId,
  Brief,
  Evidence,
  HookType,
  OnScreenText,
  QaCheck,
  QaCheckType,
  ScoreBand,
  ScoreCard,
  ScoreItem,
  ScoreItemId,
  TranscriptSegment,
  VideoAnalysis,
} from "@/lib/contract/types";
import { CHECKLIST_LABEL, CONSTANTS } from "./constants";
import { deadAirGaps, findSpokenDisclosure, findWrittenDisclosure } from "./qa";
import { median } from "./stats";
import { callsToAction, secondsLabel, textParity, wordCount } from "./text";

// ── bands ──────────────────────────────────────────────────────────────────────────────────────

/** A 85+, B 70 to 84, C 55 to 69, D 40 to 54, E under 40. */
export function bandFor(points: number): ScoreBand {
  const b = CONSTANTS.scores.bands;
  return points >= b.A ? "A" : points >= b.B ? "B" : points >= b.C ? "C" : points >= b.D ? "D" : "E";
}

const BAND_ORDER: readonly ScoreBand[] = ["A", "B", "C", "D", "E"];

/** True when `band` is at least as good as `min` (A is best). Used by auto-approve rules ("Flow band B or better"). */
export const bandAtLeast = (band: ScoreBand, min: ScoreBand): boolean => BAND_ORDER.indexOf(band) <= BAND_ORDER.indexOf(min);

/** The words that go beside a band: never a bare letter. */
export function bandDescriptor(band: ScoreBand): string {
  switch (band) {
    case "A":
      return "Strong";
    case "B":
      return "Solid";
    case "C":
      return "Fair";
    case "D":
      return "Weak";
    case "E":
      return "Needs a rework";
  }
}

/** Lowest points that still earn a band. */
export const bandFloor = (band: ScoreBand): number => CONSTANTS.scores.bands[band];

/** Points still needed to reach the next band up, or 0 at A. Powers "6 points to a B". */
export function pointsToNextBand(points: number): { next: ScoreBand | null; needed: number } {
  const band = bandFor(points);
  const i = BAND_ORDER.indexOf(band);
  if (i === 0) return { next: null, needed: 0 };
  const next = BAND_ORDER[i - 1];
  return { next, needed: Math.max(0, bandFloor(next) - points) };
}

// ── score items ────────────────────────────────────────────────────────────────────────────────

/** A checklist line plus the moment in the video it is about, so the UI can jump to it. */
export interface ScoredItem extends ScoreItem {
  /** The timecode the reason refers to, in ms, when there is one. */
  at_ms?: number;
}

export interface Scored extends Omit<ScoreCard, "items"> {
  items: ScoredItem[];
}

const grade = (full: boolean, half: boolean, max: number): number => (full ? max : half ? Math.round(max / 2) : 0);

type ChecklistDef = readonly { id: string; label: string; weight: number }[];

function makeItem(list: ChecklistDef, id: ScoreItemId, points: number, reason: string, fix?: string, at_ms?: number | null): ScoredItem {
  const def = list.find((i) => i.id === id);
  if (!def) throw new Error(`Unknown score item: ${id}`);
  const out: ScoredItem = { id, label: def.label, points, max: def.weight, passed: points === def.weight, reason };
  if (fix && points < def.weight) out.fix = fix;
  if (at_ms !== null && at_ms !== undefined) out.at_ms = at_ms;
  return out;
}

const finish = (items: ScoredItem[]): Scored => {
  const points = items.reduce((s, i) => s + i.points, 0);
  return { band: bandFor(points), points, items, label: CHECKLIST_LABEL };
};

// ── Hook Score ─────────────────────────────────────────────────────────────────────────────────

/**
 * What the Hook Score reads off the first seconds of a video. Times are ms from the start; null means it never happens.
 * The iOS hook coach (Vision, on device) and the server-side video analysis both produce this shape.
 */
export interface HookObservations {
  /** When the hook line has landed (its last word). */
  lands_ms: number | null;
  /** When the hook appears as on-screen text. */
  onscreen_ms: number | null;
  /** The on-screen text says what the voice says. */
  spoken_matches_onscreen: boolean;
  /** First face on screen. */
  face_ms: number | null;
  /** Faceless formats (slideshow, screen recording only) get the face points. */
  faceless: boolean;
  /** The app or product first on screen. */
  app_ms: number | null;
  /** First cut, zoom or motion burst. */
  interrupt_ms: number | null;
  hook_type_known: boolean;
  /** The hook type has an above-median trial rate in the library. */
  hook_type_above_median: boolean;
  /** First spoken word. */
  speech_ms: number | null;
  captions_in_safe_zone: boolean;
}

/**
 * Hook Score (first 3 seconds), 0 to 100, from checklist weights 20/15/15/15/10/10/10/5. Each item is full, half or zero by its rule;
 * every item has a timecoded reason and, when it lost points, a one-tap fix. Always labelled a checklist score.
 */
export function scoreHook(obs: HookObservations): Scored {
  const L = CONSTANTS.scores.hook_checklist;
  const lands = obs.lands_ms;
  const items: ScoredItem[] = [
    makeItem(L, "hook_lands_2s", grade(lands !== null && lands <= 2000, lands !== null && lands <= 3000, 20), lands === null ? "The hook never lands." : `Hook lands at ${secondsLabel(lands)}.`, "Open on the hook line; trim the intro.", lands),
    makeItem(
      L,
      "onscreen_text_matches",
      grade(obs.onscreen_ms !== null && obs.onscreen_ms <= 1000 && obs.spoken_matches_onscreen, obs.onscreen_ms !== null && obs.onscreen_ms <= 2000, 15),
      obs.onscreen_ms === null ? "No on-screen hook text." : `Hook text appears at ${secondsLabel(obs.onscreen_ms)}${obs.spoken_matches_onscreen ? "" : " and differs from what you say"}.`,
      "Burn the spoken hook in as text in the first second.",
      obs.onscreen_ms,
    ),
    makeItem(
      L,
      "face_early",
      obs.faceless ? 15 : grade(obs.face_ms !== null && obs.face_ms <= 1000, obs.face_ms !== null && obs.face_ms <= 2000, 15),
      obs.faceless ? "Faceless format: no face needed." : obs.face_ms === null ? "No face on screen." : obs.face_ms <= 1000 ? `Face on screen at ${secondsLabel(obs.face_ms)}.` : `No face until ${secondsLabel(obs.face_ms)}.`,
      "Start on your face, then cut to the app.",
      obs.faceless ? null : obs.face_ms,
    ),
    makeItem(L, "app_visible_3s", grade(obs.app_ms !== null && obs.app_ms <= 3000, obs.app_ms !== null && obs.app_ms <= 5000, 15), obs.app_ms === null ? "The app never appears." : `App visible at ${secondsLabel(obs.app_ms)}.`, "Move the app reveal into the first 3 seconds.", obs.app_ms),
    makeItem(L, "pattern_interrupt", obs.interrupt_ms !== null && obs.interrupt_ms <= 1500 ? 10 : 0, obs.interrupt_ms === null ? "No cut or motion in the first 1.5s." : `Pattern interrupt at ${secondsLabel(obs.interrupt_ms)}.`, "Add a cut or a zoom in the first 1.5 seconds.", obs.interrupt_ms),
    makeItem(L, "proven_hook_type", grade(obs.hook_type_known && obs.hook_type_above_median, obs.hook_type_known, 10), obs.hook_type_known ? "Library hook type." : "Not a library hook type.", "Try a confession, curiosity-gap or specific-number opening."),
    makeItem(L, "speech_starts_fast", grade(obs.speech_ms !== null && obs.speech_ms <= 1000, obs.speech_ms !== null && obs.speech_ms <= 2000, 10), obs.speech_ms === null ? "No speech found." : `Speech starts at ${secondsLabel(obs.speech_ms)}.`, "Cut the dead air before your first word.", obs.speech_ms),
    makeItem(L, "captions_safe_zone", obs.captions_in_safe_zone ? 5 : 0, obs.captions_in_safe_zone ? "Captions inside the safe zones." : "Captions outside the safe zones.", "Move captions above the platform UI."),
  ];
  return finish(items);
}

/**
 * Raw features of a hook as the on-device coach (or the web preview) measures them, before they are turned into observations.
 * Adds what the checklist alone does not see: the hook's wording, its length, and motion.
 */
export interface HookFeatures {
  /** The spoken hook line. */
  hook_text: string;
  /** When the line starts and when its last word ends. The hook has "landed" at the end. */
  hook_start_ms: number;
  hook_end_ms: number;
  /** First spoken word (null when silent). */
  speech_start_ms: number | null;
  /** Text burned in during the hook, and when it first appears. */
  onscreen_text: string | null;
  onscreen_ms: number | null;
  face_ms: number | null;
  faceless?: boolean;
  app_ms: number | null;
  /** First hard cut. */
  first_cut_ms: number | null;
  /** Mean frame-to-frame change in the first 1.5 s, 0..1. 0.35 or more counts as visual motion. */
  motion_score?: number;
  /** The library hook type the hook uses, when it matches one. */
  hook_type: HookType | null;
  /** Trial rate per hook type from the library, to decide "above median". */
  hook_type_trial_rates?: Partial<Record<HookType, number>>;
  captions_in_safe_zone: boolean;
}

/** On-screen text and voice count as the same hook above this share of overlapping content words. */
export const HOOK_TEXT_PARITY_MIN = 0.6;
/** Motion at or above this counts as a pattern interrupt even without a hard cut. */
export const MOTION_INTERRUPT_MIN = 0.35;

/** Turns raw features into the observations the checklist reads. */
export function toHookObservations(f: HookFeatures): HookObservations {
  const parity = f.onscreen_text ? textParity(f.hook_text, f.onscreen_text) : 0;
  const motionAt = (f.motion_score ?? 0) >= MOTION_INTERRUPT_MIN ? 500 : null;
  const interrupt = [f.first_cut_ms, motionAt].filter((v): v is number => v !== null);
  const rates = f.hook_type_trial_rates ? Object.values(f.hook_type_trial_rates).filter((v): v is number => typeof v === "number") : [];
  const own = f.hook_type && f.hook_type_trial_rates ? f.hook_type_trial_rates[f.hook_type] : undefined;
  return {
    lands_ms: f.hook_text.trim() === "" ? null : f.hook_end_ms,
    onscreen_ms: f.onscreen_ms,
    spoken_matches_onscreen: parity >= HOOK_TEXT_PARITY_MIN,
    face_ms: f.face_ms,
    faceless: f.faceless ?? false,
    app_ms: f.app_ms,
    interrupt_ms: interrupt.length > 0 ? Math.min(...interrupt) : null,
    hook_type_known: f.hook_type !== null,
    hook_type_above_median: own !== undefined && rates.length > 0 && own > median(rates),
    speech_ms: f.speech_start_ms,
    captions_in_safe_zone: f.captions_in_safe_zone,
  };
}

/** Plain-English advice about the hook line itself: its length in words and seconds. */
export function hookLengthAdvice(f: Pick<HookFeatures, "hook_text" | "hook_start_ms" | "hook_end_ms">): { words: number; seconds: number; advice: string | null } {
  const words = wordCount(f.hook_text);
  const seconds = Math.max(0, (f.hook_end_ms - f.hook_start_ms) / 1000);
  if (words > 14 || seconds > 3) return { words, seconds, advice: `Your hook is ${words} words and runs ${seconds.toFixed(1)}s. Trim it to one short line (under 12 words) so it lands by 2 seconds.` };
  if (words > 0 && words < 3) return { words, seconds, advice: "Your hook is very short. Add the specific thing that makes someone stay." };
  return { words, seconds, advice: null };
}

export interface HookFeatureResult {
  card: Scored;
  observations: HookObservations;
  words: number;
  /** Extra coaching beyond the checklist (hook length). */
  advice: string[];
}

/** Scores a hook from raw features: the checklist, plus advice about length. */
export function scoreHookFeatures(f: HookFeatures): HookFeatureResult {
  const observations = toHookObservations(f);
  const len = hookLengthAdvice(f);
  return { card: scoreHook(observations), observations, words: len.words, advice: len.advice ? [len.advice] : [] };
}

// ── Flow Score ─────────────────────────────────────────────────────────────────────────────────

export type FormatOrder = "in_order" | "one_off" | "out_of_order";

/** What the Flow Score reads off a whole video. */
export interface FlowObservations {
  /** The video's Hook Score points (0 to 100). */
  hook_points: number;
  beats_found: number;
  beats_required: number;
  app_ms: number | null;
  disclosure_audio: boolean;
  disclosure_onscreen: boolean;
  duration_s: number;
  captions_in_safe_zone: boolean;
  single_cta: boolean;
  ends_on_win_state: boolean;
  /** Dead-air gaps over 1 second. */
  audio_gaps: number;
  format_order: FormatOrder;
}

/**
 * Flow Score (overall predicted performance band), 0 to 100, weights 30/25/10/10/5/5/5/5/5. A missing disclosure also blocks settlement,
 * which is enforced by auto-QA, not by this score.
 */
export function scoreFlow(obs: FlowObservations): Scored {
  const L = CONSTANTS.scores.flow_checklist;
  const beats = obs.beats_required > 0 ? Math.round((25 * obs.beats_found) / obs.beats_required) : 25;
  const disclosure = (obs.disclosure_audio ? 5 : 0) + (obs.disclosure_onscreen ? 5 : 0);
  const d = obs.duration_s;
  const items: ScoredItem[] = [
    makeItem(L, "hook_score", Math.round(obs.hook_points * 0.3), `Hook Score ${obs.hook_points} scaled to 30.`, "Fix the Hook Score items first."),
    makeItem(L, "required_beats", beats, `${obs.beats_found} of ${obs.beats_required} required beats found.`, "Add the missing beat from the shot checklist."),
    makeItem(L, "app_visible_early", grade(obs.app_ms !== null && obs.app_ms <= 3000, obs.app_ms !== null && obs.app_ms <= 8000, 10), obs.app_ms === null ? "The app never appears." : `App on screen at ${secondsLabel(obs.app_ms)}.`, "Show the app by 3 seconds.", obs.app_ms),
    makeItem(L, "disclosure", disclosure, disclosure === 10 ? "#ad spoken and on screen." : disclosure === 5 ? `#ad is only ${obs.disclosure_audio ? "spoken" : "on screen"}.` : "No #ad.", "Say and show #ad."),
    makeItem(L, "length_ok", grade(d >= 15 && d <= 30, (d >= 10 && d < 15) || (d > 30 && d <= 45), 5), `Length ${d.toFixed(0)}s.`, "Aim for 15 to 30 seconds."),
    makeItem(L, "captions_safe_zone", obs.captions_in_safe_zone ? 5 : 0, obs.captions_in_safe_zone ? "Captions inside the safe zones." : "Captions outside the safe zones.", "Move captions above the platform UI."),
    makeItem(
      L,
      "single_cta_win_state",
      grade(obs.single_cta && obs.ends_on_win_state, obs.single_cta || obs.ends_on_win_state, 5),
      obs.single_cta ? (obs.ends_on_win_state ? "One CTA, ends on a win." : "One CTA but no win state at the end.") : "More than one CTA.",
      "End on the win, then one CTA.",
    ),
    makeItem(L, "audio_clear", grade(obs.audio_gaps === 0, obs.audio_gaps === 1, 5), obs.audio_gaps === 0 ? "Clear audio." : `${obs.audio_gaps} dead-air gap(s) over 1s.`, "Cut the silences."),
    makeItem(L, "format_fit", grade(obs.format_order === "in_order", obs.format_order === "one_off", 5), obs.format_order === "in_order" ? "Follows the format." : "Beats are out of order for the format.", "Re-order to the format's beats."),
  ];
  return finish(items);
}

// ── one-tap fixes ──────────────────────────────────────────────────────────────────────────────

export type HookFixKind = "add_hook_line" | "trim_intro" | "burn_in_hook_text" | "start_on_face" | "move_app_reveal" | "add_cut" | "use_proven_hook" | "cut_dead_air" | "move_captions";
export type FlowFixKind = "fix_hook_first" | "add_missing_beat" | "show_app_early" | "add_disclosure" | "trim_length" | "extend_length" | "move_captions" | "one_cta_win_state" | "cut_silences" | "reorder_beats";

/** A one-tap fix: a deterministic edit to the observations, with the points it would earn. */
export interface ScoreFix<K extends string = string> {
  /** Stable id: "<kind>". */
  id: string;
  item_id: ScoreItemId;
  kind: K;
  /** Button text: "Move the app reveal to 0:03". */
  label: string;
  /** One sentence on what changes. */
  detail: string;
  /** Points the checklist gains if the fix is applied and nothing else changes. */
  gain_points: number;
}

/** Where fixes aim: the hook lands at 1.8 s, the app shows at 2.8 s, a cut at 1.0 s, speech at 0.6 s, text at 0.8 s, a face at 0.3 s. */
const TARGET = { lands_ms: 1800, app_ms: 2800, interrupt_ms: 1000, speech_ms: 600, onscreen_ms: 800, face_ms: 300 } as const;

/** Shifts every moment earlier by `trim` ms (nothing goes below 0). */
function shiftEarlier(obs: HookObservations, trim: number): HookObservations {
  const s = (v: number | null): number | null => (v === null ? null : Math.max(0, v - trim));
  return { ...obs, lands_ms: s(obs.lands_ms), onscreen_ms: s(obs.onscreen_ms), face_ms: s(obs.face_ms), app_ms: s(obs.app_ms), interrupt_ms: s(obs.interrupt_ms), speech_ms: s(obs.speech_ms) };
}

/** Applies one hook fix to the observations and returns the edited copy. */
export function applyHookFix(obs: HookObservations, kind: HookFixKind): HookObservations {
  switch (kind) {
    case "add_hook_line":
      return { ...obs, lands_ms: TARGET.lands_ms };
    case "trim_intro":
      return obs.lands_ms === null ? obs : shiftEarlier(obs, Math.max(0, obs.lands_ms - TARGET.lands_ms));
    case "burn_in_hook_text":
      return { ...obs, onscreen_ms: TARGET.onscreen_ms, spoken_matches_onscreen: true };
    case "start_on_face":
      return { ...obs, face_ms: TARGET.face_ms };
    case "move_app_reveal":
      return { ...obs, app_ms: Math.min(obs.app_ms ?? TARGET.app_ms, TARGET.app_ms) };
    case "add_cut":
      return { ...obs, interrupt_ms: TARGET.interrupt_ms };
    case "use_proven_hook":
      return { ...obs, hook_type_known: true, hook_type_above_median: true };
    case "cut_dead_air":
      return { ...obs, speech_ms: TARGET.speech_ms };
    case "move_captions":
      return { ...obs, captions_in_safe_zone: true };
  }
}

const mmss = (ms: number): string => `0:${String(Math.round(ms / 1000)).padStart(2, "0")}`;

/** The fix a failed Hook Score item points at, with its button text. Null for an item that is already full. */
function hookFixFor(item: ScoreItem, obs: HookObservations): { kind: HookFixKind; label: string; detail: string } | null {
  if (item.points >= item.max) return null;
  switch (item.id) {
    case "hook_lands_2s":
      return obs.lands_ms === null
        ? { kind: "add_hook_line", label: "Add a hook line in the first 2 seconds", detail: "Open with one short line that lands by 1.8s." }
        : { kind: "trim_intro", label: `Trim ${((obs.lands_ms - TARGET.lands_ms) / 1000).toFixed(1)}s off the intro`, detail: `Cutting the lead-in moves the hook from ${secondsLabel(obs.lands_ms)} to ${secondsLabel(TARGET.lands_ms)}.` };
    case "onscreen_text_matches":
      return { kind: "burn_in_hook_text", label: "Burn the hook in as text", detail: "Show the words you say as on-screen text within the first second." };
    case "face_early":
      return { kind: "start_on_face", label: "Start on your face", detail: "Open with your face in frame, then cut to the app." };
    case "app_visible_3s":
      return { kind: "move_app_reveal", label: `Move the app reveal to ${mmss(TARGET.app_ms)}`, detail: `The app appears at ${secondsLabel(obs.app_ms)}. Show it by 3 seconds, then come back to your face.` };
    case "pattern_interrupt":
      return { kind: "add_cut", label: "Add a cut or zoom at 1 second", detail: "A cut or zoom in the first 1.5 seconds resets attention." };
    case "proven_hook_type":
      return { kind: "use_proven_hook", label: "Use a proven hook type", detail: "Try a confession, curiosity-gap or specific-number opening." };
    case "speech_starts_fast":
      return { kind: "cut_dead_air", label: "Cut the dead air before your first word", detail: `Speech starts at ${secondsLabel(obs.speech_ms)}. Start talking within 1 second.` };
    case "captions_safe_zone":
      return { kind: "move_captions", label: "Move captions into the safe zone", detail: "Keep captions above the platform buttons and caption area." };
    default:
      return null;
  }
}

/**
 * One-tap fixes for a Hook Score, best first. Each fix is a deterministic edit; its gain is measured by applying it and re-scoring, so the
 * band chip can update after a tap.
 */
export function suggestHookFixes(obs: HookObservations): ScoreFix<HookFixKind>[] {
  const card = scoreHook(obs);
  const fixes: ScoreFix<HookFixKind>[] = [];
  for (const item of card.items) {
    const f = hookFixFor(item, obs);
    if (!f) continue;
    const gain = scoreHook(applyHookFix(obs, f.kind)).points - card.points;
    if (gain > 0) fixes.push({ id: f.kind, item_id: item.id, kind: f.kind, label: f.label, detail: f.detail, gain_points: gain });
  }
  return fixes.sort((a, b) => b.gain_points - a.gain_points || a.id.localeCompare(b.id));
}

/** Applies every suggested hook fix in order: the best the video could score from these edits. */
export function applyAllHookFixes(obs: HookObservations): HookObservations {
  let current = obs;
  for (const fix of suggestHookFixes(obs)) current = applyHookFix(current, fix.kind);
  return current;
}

/** Applies one Flow fix to the observations. */
export function applyFlowFix(obs: FlowObservations, kind: FlowFixKind): FlowObservations {
  switch (kind) {
    case "fix_hook_first":
      return obs;
    case "add_missing_beat":
      return { ...obs, beats_found: obs.beats_required };
    case "show_app_early":
      return { ...obs, app_ms: Math.min(obs.app_ms ?? TARGET.app_ms, TARGET.app_ms) };
    case "add_disclosure":
      return { ...obs, disclosure_audio: true, disclosure_onscreen: true };
    case "trim_length":
      return { ...obs, duration_s: Math.min(obs.duration_s, 28) };
    case "extend_length":
      return { ...obs, duration_s: Math.max(obs.duration_s, 16) };
    case "move_captions":
      return { ...obs, captions_in_safe_zone: true };
    case "one_cta_win_state":
      return { ...obs, single_cta: true, ends_on_win_state: true };
    case "cut_silences":
      return { ...obs, audio_gaps: 0 };
    case "reorder_beats":
      return { ...obs, format_order: "in_order" };
  }
}

function flowFixFor(item: ScoreItem, obs: FlowObservations): { kind: FlowFixKind; label: string; detail: string } | null {
  if (item.points >= item.max) return null;
  switch (item.id) {
    case "hook_score":
      return { kind: "fix_hook_first", label: "Fix the Hook Score items first", detail: "The hook is 30 of the 100 points. Apply the hook fixes to move this." };
    case "required_beats":
      return { kind: "add_missing_beat", label: "Add the missing beat", detail: `${obs.beats_required - obs.beats_found} required beat(s) are missing. Add them from the shot checklist.` };
    case "app_visible_early":
      return { kind: "show_app_early", label: "Show the app by 3 seconds", detail: `The app appears at ${secondsLabel(obs.app_ms)}.` };
    case "disclosure":
      return { kind: "add_disclosure", label: "Say and show #ad", detail: "Say it out loud and keep #ad on screen for 2 seconds. A missing disclosure also blocks payment." };
    case "length_ok":
      return obs.duration_s > 30
        ? { kind: "trim_length", label: `Trim to 28 seconds`, detail: `The video is ${obs.duration_s.toFixed(0)}s. 15 to 30 seconds scores best.` }
        : { kind: "extend_length", label: "Add a shot to reach 15 seconds", detail: `The video is ${obs.duration_s.toFixed(0)}s. 15 to 30 seconds scores best.` };
    case "captions_safe_zone":
      return { kind: "move_captions", label: "Move captions into the safe zone", detail: "Keep captions above the platform UI." };
    case "single_cta_win_state":
      return { kind: "one_cta_win_state", label: "End on the win, then one CTA", detail: "Finish on the moment the app delivered, then ask for one thing." };
    case "audio_clear":
      return { kind: "cut_silences", label: "Cut the silences", detail: `${obs.audio_gaps} pause(s) over 1 second. One tap removes them.` };
    case "format_fit":
      return { kind: "reorder_beats", label: "Re-order to the format's beats", detail: "Follow the beat order of the format you picked." };
    default:
      return null;
  }
}

/** One-tap fixes for a Flow Score, best first. The hook fix is measured by applying all hook fixes. */
export function suggestFlowFixes(obs: FlowObservations, hookObs?: HookObservations): ScoreFix<FlowFixKind>[] {
  const card = scoreFlow(obs);
  const fixes: ScoreFix<FlowFixKind>[] = [];
  for (const item of card.items) {
    const f = flowFixFor(item, obs);
    if (!f) continue;
    let gain: number;
    if (f.kind === "fix_hook_first") {
      if (!hookObs) continue;
      const better = scoreHook(applyAllHookFixes(hookObs)).points;
      gain = scoreFlow({ ...obs, hook_points: better }).points - card.points;
    } else {
      gain = scoreFlow(applyFlowFix(obs, f.kind)).points - card.points;
    }
    if (gain > 0) fixes.push({ id: f.kind, item_id: item.id, kind: f.kind, label: f.label, detail: f.detail, gain_points: gain });
  }
  return fixes.sort((a, b) => b.gain_points - a.gain_points || a.id.localeCompare(b.id));
}

/** The reasons to show in the UI: what is working and what to fix first (largest points lost first). */
export function explainScore(card: Pick<Scored, "items" | "band" | "points">): { headline: string; strengths: ScoredItem[]; fix_first: ScoredItem[] } {
  const strengths = card.items.filter((i) => i.passed);
  const fix_first = card.items.filter((i) => !i.passed).sort((a, b) => b.max - b.points - (a.max - a.points) || b.max - a.max);
  const next = pointsToNextBand(card.points);
  const article = next.next === "A" || next.next === "E" ? "an" : "a";
  const headline = next.next ? `${bandDescriptor(card.band)} (${card.band}). ${next.needed} more point${next.needed === 1 ? "" : "s"} to ${article} ${next.next}.` : `${bandDescriptor(card.band)} (${card.band}).`;
  return { headline, strengths, fix_first };
}

// ── from a video analysis ──────────────────────────────────────────────────────────────────────

/** Moments in a video where text is on screen and inside the safe zone: every overlay must be safe, and there must be some. */
const captionsSafe = (texts: readonly OnScreenText[]): boolean => texts.length > 0 && texts.every((t) => t.in_safe_zone);

/**
 * Hook observations from a stored video analysis. `faceless` comes from the chosen format; `hookTrialRates` (trial rate per hook type
 * from the library) decides "above median".
 */
export function hookObservationsFromAnalysis(
  a: Pick<VideoAnalysis, "hook" | "transcript" | "on_screen_text" | "scenes">,
  ctx: { faceless?: boolean; hookTrialRates?: Partial<Record<HookType, number>> } = {},
): HookObservations {
  const scenes = [...a.scenes].sort((x, y) => x.t_start_ms - y.t_start_ms);
  const firstCut = scenes.length > 1 ? scenes[1].t_start_ms : null;
  const firstText = a.on_screen_text.length > 0 ? Math.min(...a.on_screen_text.map((t) => t.t_start_ms)) : null;
  const rates = ctx.hookTrialRates ? Object.values(ctx.hookTrialRates).filter((v): v is number => typeof v === "number") : [];
  const own = ctx.hookTrialRates?.[a.hook.hook_type];
  const firstSpeech = a.transcript.length > 0 ? Math.min(...a.transcript.map((t) => t.t_start_ms)) : null;
  return {
    lands_ms: a.hook.lands_at_ms,
    onscreen_ms: a.hook.caption_at_ms ?? firstText,
    spoken_matches_onscreen: a.hook.spoken_matches_onscreen,
    face_ms: a.hook.face_at_ms ?? null,
    faceless: ctx.faceless ?? false,
    app_ms: a.hook.app_at_ms ?? null,
    interrupt_ms: firstCut,
    hook_type_known: true,
    hook_type_above_median: own !== undefined && rates.length > 0 && own > median(rates),
    speech_ms: firstSpeech,
    captions_in_safe_zone: captionsSafe(a.on_screen_text),
  };
}

/** How well the found beats follow the format's order: in order, one beat out of place, or out of order. */
export function formatOrderOf(formatBeats: readonly BeatId[], hits: readonly BeatHit[]): FormatOrder {
  const found = hits.filter((h) => h.found && h.t_ms !== undefined).sort((a, b) => (a.t_ms ?? 0) - (b.t_ms ?? 0));
  const ranks = found.map((h) => formatBeats.indexOf(h.beat)).filter((r) => r >= 0);
  if (ranks.length <= 1) return "in_order";
  // Longest strictly increasing subsequence: how many beats are in the right order.
  const tails: number[] = [];
  for (const r of ranks) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = r;
  }
  const outOfPlace = ranks.length - tails.length;
  return outOfPlace === 0 ? "in_order" : outOfPlace === 1 ? "one_off" : "out_of_order";
}

/** True when a video ends on a win state: the win-state or payoff beat is found in the last 40% of the video. */
export function endsOnWinState(hits: readonly BeatHit[], durationMs: number): boolean {
  return hits.some((h) => (h.beat === "win_state" || h.beat === "payoff") && h.found && h.t_ms !== undefined && h.t_ms >= durationMs * 0.6);
}

/**
 * Flow observations from a stored video analysis. Disclosure is read from the transcript and on-screen text (the same detectors auto-QA
 * uses), the CTA count from the spoken ending, dead air from transcript gaps, and format fit from the format's beat order.
 */
export function flowObservationsFromAnalysis(
  a: Pick<VideoAnalysis, "hook" | "transcript" | "on_screen_text" | "beats" | "duration_ms">,
  ctx: { hook_points: number; format_beats?: readonly BeatId[] },
): FlowObservations {
  const required = a.beats.filter((b) => b.required);
  const endText = a.transcript.filter((t: TranscriptSegment) => t.t_start_ms >= a.duration_ms * 0.7).map((t) => t.text).join(" ");
  const ctas = callsToAction(endText);
  return {
    hook_points: ctx.hook_points,
    beats_found: required.filter((b) => b.found).length,
    beats_required: required.length,
    app_ms: a.hook.app_at_ms ?? a.beats.find((b) => b.beat === "app_reveal" && b.found)?.t_ms ?? null,
    disclosure_audio: findSpokenDisclosure(a.transcript) !== null,
    disclosure_onscreen: findWrittenDisclosure(a.on_screen_text) !== null,
    duration_s: a.duration_ms / 1000,
    captions_in_safe_zone: captionsSafe(a.on_screen_text),
    single_cta: ctas.length === 1,
    ends_on_win_state: endsOnWinState(a.beats, a.duration_ms),
    audio_gaps: deadAirGaps(a.transcript).length,
    format_order: ctx.format_beats ? formatOrderOf(ctx.format_beats, a.beats) : "in_order",
  };
}

/** Hook Score and Flow Score for a stored analysis in one call. */
export function scoreAnalysis(
  a: Pick<VideoAnalysis, "hook" | "transcript" | "on_screen_text" | "scenes" | "beats" | "duration_ms">,
  ctx: { faceless?: boolean; hookTrialRates?: Partial<Record<HookType, number>>; format_beats?: readonly BeatId[] } = {},
): { hook: Scored; flow: Scored; hook_observations: HookObservations; flow_observations: FlowObservations } {
  const hook_observations = hookObservationsFromAnalysis(a, ctx);
  const hook = scoreHook(hook_observations);
  const flow_observations = flowObservationsFromAnalysis(a, { hook_points: hook.points, format_beats: ctx.format_beats });
  return { hook, flow: scoreFlow(flow_observations), hook_observations, flow_observations };
}

// ── brief-compliance checklist ─────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  label: string;
  points: number;
  max: number;
  passed: boolean;
  detail: string;
  fix?: string;
  evidence?: Evidence;
}

export interface BriefChecklist {
  /** 0 to 100. */
  points: number;
  band: ScoreBand;
  items: ChecklistItem[];
  /** Always "Checklist score. It gets smarter as bounties settle." */
  label: string;
  /** A disclosure failed: settlement waits until it is fixed or waived. */
  blocks_settlement: boolean;
  /** Required beats found / required, for the pre-flight line "4 of 5 beats". */
  beats: { found: number; required: number };
}

const RESULT_FACTOR: Record<QaCheck["result"], number> = { pass: 1, warn: 0.5, fail: 0 };

/**
 * Brief-compliance checklist: how well a video follows what the bounty asked for, as a checklist score out of 100.
 *   required beats 40 · spoken and on-screen disclosure 20 · banned claims and competitors 10 · one CTA 5 · offer stated 5 ·
 *   music and AI label 5 · originality (no duplicate, no watermark) 5 · technical (aspect, length, resolution, safe zones, audio) 10
 * Pass is full, warn is half, fail is zero. Labelled a checklist score, always.
 */
export function scoreBriefCompliance(input: {
  brief: Pick<Brief, "offer_line" | "cta" | "beats">;
  beats: readonly BeatHit[];
  checks: readonly QaCheck[];
  /** Distinct calls to action in the spoken ending (from `callsToAction`). Omit to infer from the CTA beat. */
  cta_objectives?: number;
}): BriefChecklist {
  const byCheck = (t: QaCheckType): QaCheck | undefined => input.checks.find((c) => c.check === t);
  const factor = (t: QaCheckType): number => {
    const c = byCheck(t);
    return c ? RESULT_FACTOR[c.result] : 0;
  };
  const detail = (t: QaCheckType, fallback: string): string => byCheck(t)?.message ?? fallback;
  const evidence = (t: QaCheckType): Evidence | undefined => byCheck(t)?.evidence;
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, max: number, points: number, text: string, fix?: string, ev?: Evidence): void => {
    const p = Math.round(points);
    items.push({ id, label, points: p, max, passed: p === max, detail: text, ...(fix && p < max ? { fix } : {}), ...(ev && p < max ? { evidence: ev } : {}) });
  };

  const required = input.beats.filter((b) => b.required);
  const found = required.filter((b) => b.found);
  add("required_beats", "Required beats covered", 40, required.length === 0 ? 40 : (40 * found.length) / required.length, required.length === 0 ? "The brief has no required beats." : `${found.length} of ${required.length} required beats found.`, "Add the missing beat from the shot checklist.", evidence("brief_beats"));
  add("disclosure_audio", "#ad spoken", 10, 10 * factor("disclosure_audio"), detail("disclosure_audio", "Not checked yet."), 'Say "this is a paid partnership".', evidence("disclosure_audio"));
  add("disclosure_onscreen", "#ad on screen for 2 seconds", 10, 10 * factor("disclosure_onscreen"), detail("disclosure_onscreen", "Not checked yet."), "Keep #ad on screen for 2 seconds.", evidence("disclosure_onscreen"));
  add("claims", "No banned claims or competitors", 10, 10 * factor("banned_claims"), detail("banned_claims", "Not checked yet."), "Rephrase using the approved wording in the brief.", evidence("banned_claims"));
  const ctaBeat = input.beats.find((b) => b.beat === "cta");
  const ctaOk = input.cta_objectives !== undefined ? input.cta_objectives === 1 : ctaBeat ? ctaBeat.found : input.brief.cta.trim() === "" ? false : true;
  add("cta", "One clear call to action", 5, ctaOk ? 5 : 0, ctaOk ? "One call to action." : "The call to action is missing or asks for more than one thing.", "End with exactly one ask.");
  const offerBeat = input.beats.find((b) => b.beat === "offer");
  const offerOk = input.brief.offer_line ? Boolean(offerBeat?.found) : true;
  add("offer", "Offer stated", 5, offerOk ? 5 : 0, input.brief.offer_line ? (offerOk ? "The offer is stated." : "The offer isn't mentioned.") : "The brief has no offer line.", "Say the offer out loud once, near the end, before the call to action.");
  add("music_ai", "Music licensed, AI labelled", 5, 5 * Math.min(factor("music_licence"), factor("ai_content")), `${detail("music_licence", "Music not checked yet.")} ${detail("ai_content", "")}`.trim(), "Use a commercial-library track and label AI media.", evidence("music_licence") ?? evidence("ai_content"));
  add("originality", "Original, no watermark", 5, 5 * Math.min(factor("duplicate"), factor("watermark")), `${detail("duplicate", "Duplicate check not run yet.")} ${detail("watermark", "")}`.trim(), "Film a new original take and export without overlays.", evidence("duplicate") ?? evidence("watermark"));
  const technical: QaCheckType[] = ["aspect_ratio", "length", "resolution", "safe_zone", "audio_clarity"];
  const techPoints = technical.reduce((s, t) => s + 2 * factor(t), 0);
  const techIssues = technical.map((t) => byCheck(t)).filter((c): c is QaCheck => c !== undefined && c.result !== "pass");
  add("technical", "Format, length, quality, safe zones, audio", 10, techPoints, techIssues.length === 0 ? "Aspect, length, resolution, safe zones and audio are all fine." : techIssues.map((c) => c.message).join(" "), "Re-export at 1080x1920, keep to the length, and cut the silences.", techIssues[0]?.evidence);

  const points = items.reduce((s, i) => s + i.points, 0);
  return {
    points,
    band: bandFor(points),
    items,
    label: CHECKLIST_LABEL,
    blocks_settlement: input.checks.some((c) => c.blocks_settlement && c.result === "fail"),
    beats: { found: found.length, required: required.length },
  };
}
