import type { App, Bounty, Brand, Format, SubmissionSource } from "@/lib/contract/types";
import { scoreAnalysis, scoreBriefCompliance, suggestFlowFixes, suggestHookFixes, type BriefChecklist, type ScoreFix } from "@/lib/engine";
import type { HookFixKind, FlowFixKind } from "@/lib/engine";
import { analyzeClip, type ClipAnalysis, type ClipInput } from "@/lib/store/core/analysis";

/** The five steps of Studio-lite, in order. */
export const STUDIO_STEPS = [
  { id: "bounty", label: "Bounty", description: "Pick the bounty and a format" },
  { id: "script", label: "Script", description: "Flo, the hook library or your own" },
  { id: "clip", label: "Clip", description: "Upload or import a take" },
  { id: "score", label: "Score", description: "Hook Score, Flow Score and the brief check" },
  { id: "submit", label: "Submit", description: "Pre-flight, then send for review" },
] as const;
export type StudioStepId = (typeof STUDIO_STEPS)[number]["id"];

export type MusicKind = "original" | "commercial_library" | "trending_sound";

/** What Studio-lite knows about the take. The demo reads the script and these markers; the iOS app reads the video itself, on the device. */
export interface StudioDraft {
  bountyId: string | null;
  formatId: string | null;
  /** The first line you say. The Hook Score reads it. */
  hook: string;
  /** What you say, one sentence per line. Empty means "start from the brief's points". */
  script: string;
  /** Flo's shot plan for the chosen option, shown beside the clip as a checklist. */
  plan: string[];
  file: { name: string; sizeBytes: number; durationS: number | null; sample: boolean } | null;
  source: SubmissionSource;
  markers: {
    speechStartMs: number;
    faceAtMs: number;
    appAtMs: number;
    /** A hard cut or zoom. Null means none yet. */
    firstCutMs: number | null;
    hookOnScreen: boolean;
    music: MusicKind;
  };
  title: string;
  step: number;
  rightsAccepted: boolean;
  updatedAt: string;
}

export const DEFAULT_MARKERS: StudioDraft["markers"] = { speechStartMs: 450, faceAtMs: 300, appAtMs: 2200, firstCutMs: null, hookOnScreen: true, music: "commercial_library" };

export function emptyDraft(now: string): StudioDraft {
  return { bountyId: null, formatId: null, hook: "", script: "", plan: [], file: null, source: "web_studio", markers: DEFAULT_MARKERS, title: "", step: 0, rightsAccepted: false, updatedAt: now };
}

const DRAFTS_KEY = "flowd-studio-drafts-v1";

/** Drafts live in this browser only: a per-viewer convenience that works without storage. */
export function readDrafts(): Record<string, StudioDraft> {
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, StudioDraft>) : {};
  } catch {
    return {};
  }
}

export function writeDraft(draft: StudioDraft): void {
  if (!draft.bountyId) return;
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ ...readDrafts(), [draft.bountyId]: draft }));
  } catch {
    // Storage blocked or full: the draft stays in memory for this visit.
  }
}

export function removeDraft(bountyId: string): void {
  try {
    const all = readDrafts();
    delete all[bountyId];
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
  } catch {
    // nothing to remove
  }
}

/** The clip as the analyzer and `submitVideo` take it. Disclosure is always added: it is locked, not a choice. */
export function buildClip(draft: StudioDraft, formatFaceless: boolean): ClipInput {
  const m = draft.markers;
  return {
    ...(draft.script.trim() ? { script: draft.script } : {}),
    ...(draft.hook.trim() ? { hook_text: draft.hook.trim() } : {}),
    caption_hook: m.hookOnScreen,
    ...(draft.file?.durationS ? { duration_s: draft.file.durationS } : {}),
    speech_start_ms: m.speechStartMs,
    ...(formatFaceless ? {} : { face_at_ms: m.faceAtMs }),
    app_at_ms: m.appAtMs,
    ...(m.firstCutMs !== null ? { first_cut_ms: m.firstCutMs } : {}),
    include_disclosure: true,
    has_captions: true,
    music: { detected: true, kind: m.music },
  };
}

export interface StudioScore {
  analysis: ClipAnalysis;
  hookFixes: ScoreFix<HookFixKind>[];
  flowFixes: ScoreFix<FlowFixKind>[];
  brief: BriefChecklist;
}

/** Scores a draft with the same checklist code the brand's review queue uses, so the numbers a creator sees here are the numbers the brand sees. */
export function scoreDraft(draft: StudioDraft, ctx: { bounty: Bounty; app: App; brand: Brand; format?: Format; creatorId: string }): StudioScore {
  const faceless = ctx.format?.faceless ?? false;
  const analysis = analyzeClip({ clip: buildClip(draft, faceless), bounty: ctx.bounty, app: ctx.app, brand: ctx.brand, ...(ctx.format ? { format: ctx.format } : {}), creatorId: ctx.creatorId, title: draft.title || "Draft" });
  const a = analysis.analysis;
  const scored = scoreAnalysis({ hook: a.hook, transcript: a.transcript, on_screen_text: a.on_screen_text, scenes: a.scenes, beats: a.beats, duration_ms: a.duration_ms }, { faceless, format_beats: ctx.format?.beats.map((b) => b.beat) });
  return {
    analysis,
    hookFixes: suggestHookFixes(scored.hook_observations),
    flowFixes: suggestFlowFixes(scored.flow_observations, scored.hook_observations),
    brief: scoreBriefCompliance({ brief: { offer_line: ctx.bounty.brief.offer_line, cta: ctx.bounty.brief.cta, beats: ctx.bounty.brief.beats }, beats: a.beats, checks: a.checks }),
  };
}

/** The first sentence of a script or an empty string. */
export const firstLine = (text: string): string => (text.trim().match(/[^.?!\n]+[.?!]*/)?.[0] ?? "").trim();

const ONE_TAP: ReadonlySet<string> = new Set(["add_hook_line", "trim_intro", "burn_in_hook_text", "start_on_face", "move_app_reveal", "show_app_early", "add_cut", "use_proven_hook", "cut_dead_air", "add_missing_beat"]);

/** Can Studio apply this fix itself? The rest (cut silences, re-order beats, change the length) need the video, so they are advice with a pointer to the app. */
export const isOneTap = (fix: ScoreFix): boolean => ONE_TAP.has(fix.kind);

/** Fixes Studio can apply with one tap, as an edit to the draft. A fix that needs the video itself (cut silences, re-order beats) is advice only. */
export function applyFix(draft: StudioDraft, fix: ScoreFix, score: StudioScore, ctx: { bounty: Bounty; hooks: readonly string[] }): StudioDraft | null {
  const m = draft.markers;
  const hookLands = score.analysis.analysis.hook.lands_at_ms;
  switch (fix.kind) {
    case "add_hook_line":
      return { ...draft, hook: draft.hook || firstLine(draft.script) || ctx.hooks[0] || "", markers: { ...m, speechStartMs: Math.min(m.speechStartMs, 300) } };
    case "trim_intro":
      return { ...draft, markers: { ...m, speechStartMs: Math.max(150, m.speechStartMs - Math.max(0, hookLands - 1800)) } };
    case "burn_in_hook_text":
      return { ...draft, markers: { ...m, hookOnScreen: true } };
    case "start_on_face":
      return { ...draft, markers: { ...m, faceAtMs: 300 } };
    case "move_app_reveal":
    case "show_app_early":
      return { ...draft, markers: { ...m, appAtMs: Math.min(m.appAtMs, 2800) } };
    case "add_cut":
      return { ...draft, markers: { ...m, firstCutMs: 1000 } };
    case "use_proven_hook":
      return ctx.hooks[0] ? { ...draft, hook: ctx.hooks[0] } : null;
    case "cut_dead_air":
      return { ...draft, markers: { ...m, speechStartMs: Math.min(m.speechStartMs, 600) } };
    case "add_missing_beat": {
      const missing = score.analysis.analysis.beats.filter((b) => b.required && !b.found);
      const lines = missing.map((b) => ctx.bounty.brief.beats.find((x) => x.beat === b.beat)?.hint ?? ctx.bounty.brief.beats.find((x) => x.beat === b.beat)?.label ?? "").filter(Boolean);
      return lines.length > 0 ? { ...draft, script: `${draft.script.trim() || defaultScript(draft, ctx.bounty)}\n${lines.join("\n")}` } : null;
    }
    default:
      return null;
  }
}

/** The starting script: the hook, then the brief's must-say points, the offer and the one call to action. The creator makes it theirs. */
export function defaultScript(draft: Pick<StudioDraft, "hook">, bounty: Bounty): string {
  const brief = bounty.brief;
  return [draft.hook, ...brief.talking_points, brief.offer_line, brief.cta].filter((line): line is string => Boolean(line && line.trim())).join("\n");
}
