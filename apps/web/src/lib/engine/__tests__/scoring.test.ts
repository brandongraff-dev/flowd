import { describe, expect, it } from "vitest";
import type { BeatHit, HookType, VideoAnalysis } from "@/lib/contract/types";
import { CHECKLIST_LABEL } from "../constants";
import {
  applyAllHookFixes,
  applyFlowFix,
  applyHookFix,
  bandAtLeast,
  bandDescriptor,
  bandFloor,
  bandFor,
  endsOnWinState,
  explainScore,
  flowObservationsFromAnalysis,
  formatOrderOf,
  hookLengthAdvice,
  hookObservationsFromAnalysis,
  pointsToNextBand,
  scoreAnalysis,
  scoreBriefCompliance,
  scoreFlow,
  scoreHook,
  scoreHookFeatures,
  suggestFlowFixes,
  suggestHookFixes,
  toHookObservations,
  type FlowObservations,
  type HookFeatures,
  type HookObservations,
} from "../scoring";
import { brief, goodOnScreen, goodTranscript, passChecks } from "./helpers";

const GOOD_HOOK: HookObservations = {
  lands_ms: 2400,
  onscreen_ms: 900,
  spoken_matches_onscreen: true,
  face_ms: 300,
  faceless: false,
  app_ms: 2800,
  interrupt_ms: 1200,
  hook_type_known: true,
  hook_type_above_median: true,
  speech_ms: 400,
  captions_in_safe_zone: true,
};

const BAD_HOOK: HookObservations = {
  lands_ms: 3600,
  onscreen_ms: null,
  spoken_matches_onscreen: false,
  face_ms: 3100,
  faceless: false,
  app_ms: 6200,
  interrupt_ms: null,
  hook_type_known: false,
  hook_type_above_median: false,
  speech_ms: 1700,
  captions_in_safe_zone: false,
};

const GOOD_FLOW: FlowObservations = {
  hook_points: 90,
  beats_found: 4,
  beats_required: 5,
  app_ms: 2800,
  disclosure_audio: true,
  disclosure_onscreen: true,
  duration_s: 24,
  captions_in_safe_zone: true,
  single_cta: true,
  ends_on_win_state: true,
  audio_gaps: 0,
  format_order: "in_order",
};

const BAD_FLOW: FlowObservations = {
  hook_points: 34,
  beats_found: 2,
  beats_required: 5,
  app_ms: 9000,
  disclosure_audio: false,
  disclosure_onscreen: true,
  duration_s: 52,
  captions_in_safe_zone: false,
  single_cta: false,
  ends_on_win_state: false,
  audio_gaps: 3,
  format_order: "out_of_order",
};

const pts = (card: { items: { id: string; points: number }[] }, id: string): number => card.items.find((i) => i.id === id)?.points ?? -1;

describe("bands", () => {
  it("cuts at A 85, B 70, C 55, D 40", () => {
    expect([100, 85, 84, 70, 69, 55, 54, 40, 39, 0].map(bandFor)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D", "E", "E"]);
  });

  it("compares bands with A best", () => {
    expect(bandAtLeast("A", "B")).toBe(true);
    expect(bandAtLeast("B", "B")).toBe(true);
    expect(bandAtLeast("C", "B")).toBe(false);
    expect(bandAtLeast("E", "E")).toBe(true);
  });

  it("describes a band in words and finds the next one up", () => {
    expect(["A", "B", "C", "D", "E"].map((b) => bandDescriptor(b as never))).toEqual(["Strong", "Solid", "Fair", "Weak", "Needs a rework"]);
    expect(bandFloor("B")).toBe(70);
    expect(pointsToNextBand(64)).toEqual({ next: "B", needed: 6 });
    expect(pointsToNextBand(85)).toEqual({ next: null, needed: 0 });
    expect(pointsToNextBand(10)).toEqual({ next: "D", needed: 30 });
  });
});

describe("Hook Score (DOMAIN worked example: hook lands at 2.4 s, everything else on time)", () => {
  const card = scoreHook(GOOD_HOOK);

  it("scores 90 and band A", () => {
    expect(card.points).toBe(90);
    expect(card.band).toBe("A");
  });

  it("gives half points for a hook that lands by 3 seconds, and the rest in full", () => {
    expect(card.items.map((i) => [i.id, i.points, i.max])).toEqual([
      ["hook_lands_2s", 10, 20],
      ["onscreen_text_matches", 15, 15],
      ["face_early", 15, 15],
      ["app_visible_3s", 15, 15],
      ["pattern_interrupt", 10, 10],
      ["proven_hook_type", 10, 10],
      ["speech_starts_fast", 10, 10],
      ["captions_safe_zone", 5, 5],
    ]);
    expect(card.items.reduce((s, i) => s + i.max, 0)).toBe(100);
  });

  it("explains every item with a timecoded reason and a fix only where points were lost", () => {
    expect(card.items[0]).toMatchObject({ reason: "Hook lands at 2.4s.", fix: "Open on the hook line; trim the intro.", passed: false, at_ms: 2400 });
    expect(card.items[1]).toMatchObject({ reason: "Hook text appears at 0.9s.", passed: true });
    expect(card.items[1].fix).toBeUndefined();
    expect(card.items[2].reason).toBe("Face on screen at 0.3s.");
    expect(card.items[3].reason).toBe("App visible at 2.8s.");
    expect(card.items[4].reason).toBe("Pattern interrupt at 1.2s.");
    expect(card.items[5].reason).toBe("Library hook type.");
    expect(card.items[6].reason).toBe("Speech starts at 0.4s.");
    expect(card.items[7].reason).toBe("Captions inside the safe zones.");
  });

  it("is always labelled a checklist score", () => {
    expect(card.label).toBe(CHECKLIST_LABEL);
    expect(card.label).toBe("Checklist score. It gets smarter as bounties settle.");
    expect(scoreFlow(GOOD_FLOW).label).toBe(CHECKLIST_LABEL);
  });

  it("scores the worst case 5 and band E (half of the 10-point speech item and the safe-zone miss)", () => {
    const bad = scoreHook(BAD_HOOK);
    expect(bad.points).toBe(5);
    expect(bad.band).toBe("E");
    expect(bad.items.map((i) => i.points)).toEqual([0, 0, 0, 0, 0, 0, 5, 0]);
    expect(bad.items[1].reason).toBe("No on-screen hook text.");
    expect(bad.items[2].reason).toBe("No face until 3.1s.");
    expect(bad.items[4].reason).toBe("No cut or motion in the first 1.5s.");
    expect(bad.items[5].reason).toBe("Not a library hook type.");
    expect(bad.items[7].reason).toBe("Captions outside the safe zones.");
  });

  it("covers every partial-credit rule", () => {
    expect(pts(scoreHook({ ...GOOD_HOOK, lands_ms: 2000 }), "hook_lands_2s")).toBe(20);
    expect(pts(scoreHook({ ...GOOD_HOOK, lands_ms: 2001 }), "hook_lands_2s")).toBe(10);
    expect(pts(scoreHook({ ...GOOD_HOOK, lands_ms: 3000 }), "hook_lands_2s")).toBe(10);
    expect(pts(scoreHook({ ...GOOD_HOOK, lands_ms: 3001 }), "hook_lands_2s")).toBe(0);
    expect(scoreHook({ ...GOOD_HOOK, lands_ms: null }).items[0].reason).toBe("The hook never lands.");
    expect(pts(scoreHook({ ...GOOD_HOOK, onscreen_ms: 1500 }), "onscreen_text_matches")).toBe(8);
    expect(pts(scoreHook({ ...GOOD_HOOK, spoken_matches_onscreen: false }), "onscreen_text_matches")).toBe(8);
    expect(scoreHook({ ...GOOD_HOOK, spoken_matches_onscreen: false }).items[1].reason).toBe("Hook text appears at 0.9s and differs from what you say.");
    expect(pts(scoreHook({ ...GOOD_HOOK, onscreen_ms: 2100 }), "onscreen_text_matches")).toBe(0);
    expect(pts(scoreHook({ ...GOOD_HOOK, face_ms: 1500 }), "face_early")).toBe(8);
    expect(pts(scoreHook({ ...GOOD_HOOK, face_ms: 2500 }), "face_early")).toBe(0);
    expect(pts(scoreHook({ ...GOOD_HOOK, face_ms: null }), "face_early")).toBe(0);
    expect(pts(scoreHook({ ...GOOD_HOOK, face_ms: null, faceless: true }), "face_early")).toBe(15);
    expect(scoreHook({ ...GOOD_HOOK, faceless: true }).items[2].reason).toBe("Faceless format: no face needed.");
    expect(pts(scoreHook({ ...GOOD_HOOK, app_ms: 4000 }), "app_visible_3s")).toBe(8);
    expect(pts(scoreHook({ ...GOOD_HOOK, app_ms: 5001 }), "app_visible_3s")).toBe(0);
    expect(scoreHook({ ...GOOD_HOOK, app_ms: null }).items[3].reason).toBe("The app never appears.");
    expect(pts(scoreHook({ ...GOOD_HOOK, interrupt_ms: 1500 }), "pattern_interrupt")).toBe(10);
    expect(pts(scoreHook({ ...GOOD_HOOK, interrupt_ms: 1501 }), "pattern_interrupt")).toBe(0);
    expect(pts(scoreHook({ ...GOOD_HOOK, hook_type_above_median: false }), "proven_hook_type")).toBe(5);
    expect(pts(scoreHook({ ...GOOD_HOOK, speech_ms: 1500 }), "speech_starts_fast")).toBe(5);
    expect(pts(scoreHook({ ...GOOD_HOOK, speech_ms: null }), "speech_starts_fast")).toBe(0);
    expect(scoreHook({ ...GOOD_HOOK, speech_ms: null }).items[6].reason).toBe("No speech found.");
  });

  it("tops out at exactly 100", () => {
    expect(scoreHook({ ...GOOD_HOOK, lands_ms: 1800 }).points).toBe(100);
  });
});

describe("Flow Score (DOMAIN worked example: 4 of 5 beats, 24 s)", () => {
  const card = scoreFlow(GOOD_FLOW);

  it("scores 92 and band A", () => {
    expect(card.points).toBe(92);
    expect(card.band).toBe("A");
    expect(card.items.map((i) => [i.id, i.points, i.max])).toEqual([
      ["hook_score", 27, 30],
      ["required_beats", 20, 25],
      ["app_visible_early", 10, 10],
      ["disclosure", 10, 10],
      ["length_ok", 5, 5],
      ["captions_safe_zone", 5, 5],
      ["single_cta_win_state", 5, 5],
      ["audio_clear", 5, 5],
      ["format_fit", 5, 5],
    ]);
    expect(card.items.reduce((s, i) => s + i.max, 0)).toBe(100);
  });

  it("reasons match the worked example text", () => {
    expect(card.items[0].reason).toBe("Hook Score 90 scaled to 30.");
    expect(card.items[1].reason).toBe("4 of 5 required beats found.");
    expect(card.items[2].reason).toBe("App on screen at 2.8s.");
    expect(card.items[3].reason).toBe("#ad spoken and on screen.");
    expect(card.items[4].reason).toBe("Length 24s.");
    expect(card.items[6].reason).toBe("One CTA, ends on a win.");
    expect(card.items[7].reason).toBe("Clear audio.");
    expect(card.items[8].reason).toBe("Follows the format.");
  });

  it("scores the worst case 25 and band E", () => {
    const bad = scoreFlow(BAD_FLOW);
    expect(bad.points).toBe(25);
    expect(bad.band).toBe("E");
    expect(bad.items.map((i) => i.points)).toEqual([10, 10, 0, 5, 0, 0, 0, 0, 0]);
    expect(bad.items[3].reason).toBe("#ad is only on screen.");
    expect(bad.items[7].reason).toBe("3 dead-air gap(s) over 1s.");
  });

  it("covers the partial-credit rules", () => {
    expect(pts(scoreFlow({ ...GOOD_FLOW, app_ms: 8000 }), "app_visible_early")).toBe(5);
    expect(pts(scoreFlow({ ...GOOD_FLOW, app_ms: 8001 }), "app_visible_early")).toBe(0);
    expect(pts(scoreFlow({ ...GOOD_FLOW, app_ms: null }), "app_visible_early")).toBe(0);
    expect(pts(scoreFlow({ ...GOOD_FLOW, disclosure_audio: false, disclosure_onscreen: false }), "disclosure")).toBe(0);
    expect(scoreFlow({ ...GOOD_FLOW, disclosure_audio: false, disclosure_onscreen: false }).items[3].reason).toBe("No #ad.");
    expect(scoreFlow({ ...GOOD_FLOW, disclosure_onscreen: false }).items[3].reason).toBe("#ad is only spoken.");
    for (const [d, expected] of [[9.9, 0], [10, 3], [14.9, 3], [15, 5], [30, 5], [30.1, 3], [45, 3], [45.1, 0]] as const) {
      expect(pts(scoreFlow({ ...GOOD_FLOW, duration_s: d }), "length_ok")).toBe(expected);
    }
    expect(pts(scoreFlow({ ...GOOD_FLOW, ends_on_win_state: false }), "single_cta_win_state")).toBe(3);
    expect(scoreFlow({ ...GOOD_FLOW, ends_on_win_state: false }).items[6].reason).toBe("One CTA but no win state at the end.");
    expect(pts(scoreFlow({ ...GOOD_FLOW, single_cta: false }), "single_cta_win_state")).toBe(3);
    expect(pts(scoreFlow({ ...GOOD_FLOW, audio_gaps: 1 }), "audio_clear")).toBe(3);
    expect(pts(scoreFlow({ ...GOOD_FLOW, format_order: "one_off" }), "format_fit")).toBe(3);
  });

  it("treats a brief with no required beats as full beat credit", () => {
    expect(pts(scoreFlow({ ...GOOD_FLOW, beats_required: 0, beats_found: 0 }), "required_beats")).toBe(25);
  });
});

describe("explanations", () => {
  it("lists strengths and what to fix first (most points lost first)", () => {
    const e = explainScore(scoreHook(BAD_HOOK));
    expect(e.fix_first[0].id).toBe("hook_lands_2s");
    expect(e.fix_first).toHaveLength(8);
    expect(e.strengths).toEqual([]);
    expect(explainScore(scoreHook({ ...GOOD_HOOK, lands_ms: 1800 })).fix_first).toEqual([]);
  });

  it("says how far the next band is", () => {
    expect(explainScore(scoreHook({ ...GOOD_HOOK, lands_ms: 1800 })).headline).toBe("Strong (A).");
    expect(explainScore(scoreHook({ ...GOOD_HOOK, app_ms: 4000 })).headline).toBe("Solid (B). 2 more points to an A.");
    const c = explainScore(scoreFlow(BAD_FLOW));
    expect(c.headline).toMatch(/Needs a rework \(E\)\. 15 more points to a D\./);
    expect(explainScore({ ...scoreHook(GOOD_HOOK), points: 84, band: "B" }).headline).toBe("Solid (B). 1 more point to an A.");
    expect(explainScore({ ...scoreHook(GOOD_HOOK), points: 62, band: "C" }).headline).toBe("Fair (C). 8 more points to a B.");
  });
});

describe("one-tap fixes", () => {
  it("suggests fixes for failed items, biggest gain first, each measured by re-scoring", () => {
    const fixes = suggestHookFixes(GOOD_HOOK);
    expect(fixes.map((f) => f.id)).toEqual(["trim_intro"]);
    expect(fixes[0]).toMatchObject({ item_id: "hook_lands_2s", gain_points: 10, label: "Trim 0.6s off the intro" });
    expect(suggestHookFixes({ ...GOOD_HOOK, lands_ms: 1800 })).toEqual([]);

    const worst = suggestHookFixes(BAD_HOOK);
    expect(worst.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < worst.length; i += 1) expect(worst[i - 1].gain_points).toBeGreaterThanOrEqual(worst[i].gain_points);
    expect(worst.every((f) => f.gain_points > 0)).toBe(true);
    expect(worst.map((f) => f.kind)).toContain("move_app_reveal");
  });

  it("each fix applies a deterministic edit and the score rises by its stated gain", () => {
    for (const fix of suggestHookFixes(BAD_HOOK)) {
      const after = scoreHook(applyHookFix(BAD_HOOK, fix.kind)).points;
      expect(after - scoreHook(BAD_HOOK).points).toBe(fix.gain_points);
    }
  });

  it("applying every fix lifts a bad hook to a strong band, with the band chip updating", () => {
    const better = applyAllHookFixes(BAD_HOOK);
    const card = scoreHook(better);
    expect(card.band).toBe("A");
    expect(card.points).toBeGreaterThanOrEqual(85);
    expect(suggestHookFixes(better).length).toBeLessThanOrEqual(1);
  });

  it("trimming the intro shifts every moment earlier", () => {
    const t = applyHookFix({ ...GOOD_HOOK, lands_ms: 3000 }, "trim_intro");
    expect(t.lands_ms).toBe(1800);
    expect(t.app_ms).toBe(1600);
    expect(t.face_ms).toBe(0);
    expect(applyHookFix({ ...GOOD_HOOK, lands_ms: null }, "trim_intro").lands_ms).toBeNull();
    expect(applyHookFix({ ...GOOD_HOOK, lands_ms: null }, "add_hook_line").lands_ms).toBe(1800);
  });

  it("move_app_reveal never moves the app later", () => {
    expect(applyHookFix({ ...GOOD_HOOK, app_ms: 1000 }, "move_app_reveal").app_ms).toBe(1000);
    expect(applyHookFix({ ...GOOD_HOOK, app_ms: null }, "move_app_reveal").app_ms).toBe(2800);
  });

  it("suggests flow fixes, with the hook fix measured by applying every hook fix", () => {
    const fixes = suggestFlowFixes(BAD_FLOW, BAD_HOOK);
    expect(fixes.map((f) => f.kind)).toContain("fix_hook_first");
    expect(fixes.map((f) => f.kind)).toContain("add_disclosure");
    expect(fixes.map((f) => f.kind)).toContain("trim_length");
    for (let i = 1; i < fixes.length; i += 1) expect(fixes[i - 1].gain_points).toBeGreaterThanOrEqual(fixes[i].gain_points);
    for (const fix of fixes.filter((f) => f.kind !== "fix_hook_first")) {
      expect(scoreFlow(applyFlowFix(BAD_FLOW, fix.kind)).points - scoreFlow(BAD_FLOW).points).toBe(fix.gain_points);
    }
    // without the hook observations the hook fix cannot be sized
    expect(suggestFlowFixes(BAD_FLOW).map((f) => f.kind)).not.toContain("fix_hook_first");
    expect(suggestFlowFixes({ ...GOOD_FLOW, beats_found: 5, hook_points: 100 })).toEqual([]);
  });

  it("offers the right length fix in each direction", () => {
    expect(suggestFlowFixes({ ...GOOD_FLOW, duration_s: 40 }).find((f) => f.kind === "trim_length")?.gain_points).toBe(2);
    expect(suggestFlowFixes({ ...GOOD_FLOW, duration_s: 12 }).find((f) => f.kind === "extend_length")?.gain_points).toBe(2);
    expect(applyFlowFix(GOOD_FLOW, "trim_length").duration_s).toBe(24);
    expect(applyFlowFix({ ...GOOD_FLOW, duration_s: 50 }, "trim_length").duration_s).toBe(28);
    expect(applyFlowFix({ ...GOOD_FLOW, duration_s: 8 }, "extend_length").duration_s).toBe(16);
    expect(applyFlowFix(BAD_FLOW, "fix_hook_first")).toEqual(BAD_FLOW);
    expect(applyFlowFix(BAD_FLOW, "show_app_early").app_ms).toBe(2800);
    expect(applyFlowFix(BAD_FLOW, "cut_silences").audio_gaps).toBe(0);
    expect(applyFlowFix(BAD_FLOW, "reorder_beats").format_order).toBe("in_order");
    expect(applyFlowFix(BAD_FLOW, "one_cta_win_state")).toMatchObject({ single_cta: true, ends_on_win_state: true });
    expect(applyFlowFix(BAD_FLOW, "move_captions").captions_in_safe_zone).toBe(true);
    expect(applyFlowFix(BAD_FLOW, "add_missing_beat").beats_found).toBe(5);
  });
});

describe("hook features", () => {
  const features = (over: Partial<HookFeatures> = {}): HookFeatures => ({
    hook_text: "I was wrong about editing apps",
    hook_start_ms: 300,
    hook_end_ms: 2300,
    speech_start_ms: 300,
    onscreen_text: "I was wrong about editing apps",
    onscreen_ms: 700,
    face_ms: 200,
    app_ms: 2600,
    first_cut_ms: 1100,
    hook_type: "confession",
    hook_type_trial_rates: { confession: 0.09, curiosity_gap: 0.06, pov: 0.05 },
    captions_in_safe_zone: true,
    ...over,
  });

  it("turns raw features into observations", () => {
    const o = toHookObservations(features());
    expect(o).toMatchObject({ lands_ms: 2300, onscreen_ms: 700, spoken_matches_onscreen: true, face_ms: 200, app_ms: 2600, interrupt_ms: 1100, hook_type_known: true, hook_type_above_median: true, speech_ms: 300 });
  });

  it("judges on-screen text parity, not exact equality", () => {
    expect(toHookObservations(features({ onscreen_text: "WRONG about editing apps" })).spoken_matches_onscreen).toBe(true);
    expect(toHookObservations(features({ onscreen_text: "Download now!" })).spoken_matches_onscreen).toBe(false);
    expect(toHookObservations(features({ onscreen_text: null, onscreen_ms: null })).spoken_matches_onscreen).toBe(false);
  });

  it("counts motion as a pattern interrupt when there is no cut", () => {
    expect(toHookObservations(features({ first_cut_ms: null, motion_score: 0.5 })).interrupt_ms).toBe(500);
    expect(toHookObservations(features({ first_cut_ms: null, motion_score: 0.2 })).interrupt_ms).toBeNull();
    expect(toHookObservations(features({ first_cut_ms: 900, motion_score: 0.5 })).interrupt_ms).toBe(500);
  });

  it("needs a library hook type and an above-median trial rate for full hook-type credit", () => {
    expect(toHookObservations(features({ hook_type: null })).hook_type_known).toBe(false);
    expect(toHookObservations(features({ hook_type: "pov" })).hook_type_above_median).toBe(false); // 0.05 is the median of the three rates
    expect(toHookObservations(features({ hook_type_trial_rates: undefined })).hook_type_above_median).toBe(false);
  });

  it("treats an empty hook as one that never lands", () => {
    expect(toHookObservations(features({ hook_text: "  " })).lands_ms).toBeNull();
  });

  it("advises on a hook that is too long or too short", () => {
    expect(hookLengthAdvice({ hook_text: "I was wrong about editing apps", hook_start_ms: 300, hook_end_ms: 2300 })).toMatchObject({ words: 6, seconds: 2, advice: null });
    const long = hookLengthAdvice({ hook_text: "So the thing I wanted to tell you all about today is that I really did not expect to like this app at all", hook_start_ms: 0, hook_end_ms: 4500 });
    expect(long.advice).toMatch(/Trim it to one short line/);
    expect(hookLengthAdvice({ hook_text: "Wow", hook_start_ms: 0, hook_end_ms: 500 }).advice).toMatch(/very short/);
    expect(hookLengthAdvice({ hook_text: "", hook_start_ms: 0, hook_end_ms: 0 }).advice).toBeNull();
  });

  it("scores a hook from features with advice", () => {
    const r = scoreHookFeatures(features());
    expect(r.card.points).toBe(scoreHook(r.observations).points);
    expect(r.words).toBe(6);
    expect(r.advice).toEqual([]);
    expect(scoreHookFeatures(features({ hook_text: "So the thing I wanted to tell you all about today is that I really did not expect to like this app at all", hook_end_ms: 5000 })).advice).toHaveLength(1);
  });
});

describe("from a video analysis", () => {
  const beats = (): BeatHit[] => [
    { beat: "hook", required: true, found: true, t_ms: 300 },
    { beat: "app_reveal", required: true, found: true, t_ms: 2600 },
    { beat: "demo", required: true, found: true, t_ms: 5200 },
    { beat: "offer", required: true, found: true, t_ms: 15_300 },
    { beat: "cta", required: true, found: true, t_ms: 20_100 },
    { beat: "win_state", required: false, found: true, t_ms: 17_000 },
  ];

  const analysis = (over: Partial<Pick<VideoAnalysis, "hook" | "transcript" | "on_screen_text" | "scenes" | "beats" | "duration_ms">> = {}) => ({
    hook: { text: "I was wrong about photo editing apps.", hook_type: "confession" as HookType, lands_at_ms: 2300, face_at_ms: 300, app_at_ms: 2700, caption_at_ms: 700, spoken_matches_onscreen: true },
    transcript: goodTranscript(),
    on_screen_text: goodOnScreen(),
    scenes: [
      { t_start_ms: 0, t_end_ms: 1100, kind: "face" as const },
      { t_start_ms: 1100, t_end_ms: 6000, kind: "screen_recording" as const },
    ],
    beats: beats(),
    duration_ms: 24_000,
    ...over,
  });

  it("reads hook observations off the analysis", () => {
    const o = hookObservationsFromAnalysis(analysis(), { hookTrialRates: { confession: 0.09, pov: 0.04, curiosity_gap: 0.06 } });
    expect(o).toMatchObject({ lands_ms: 2300, onscreen_ms: 700, face_ms: 300, app_ms: 2700, interrupt_ms: 1100, speech_ms: 300, hook_type_known: true, hook_type_above_median: true, captions_in_safe_zone: true, faceless: false });
  });

  it("falls back to the first on-screen text and handles missing moments", () => {
    const a = analysis({ hook: { text: "x", hook_type: "pov", lands_at_ms: 2500, spoken_matches_onscreen: false } });
    const o = hookObservationsFromAnalysis(a);
    expect(o.onscreen_ms).toBe(600);
    expect(o.face_ms).toBeNull();
    expect(o.app_ms).toBeNull();
    expect(o.hook_type_above_median).toBe(false);
    expect(hookObservationsFromAnalysis(analysis({ transcript: [], on_screen_text: [], scenes: [{ t_start_ms: 0, t_end_ms: 24_000, kind: "face" }] })).interrupt_ms).toBeNull();
    expect(hookObservationsFromAnalysis(analysis({ transcript: [], on_screen_text: [] })).speech_ms).toBeNull();
    expect(hookObservationsFromAnalysis(analysis({ on_screen_text: [] })).captions_in_safe_zone).toBe(false);
    expect(hookObservationsFromAnalysis(analysis(), { faceless: true }).faceless).toBe(true);
  });

  it("reads flow observations: disclosure, one CTA, win state, gaps and format order", () => {
    const o = flowObservationsFromAnalysis(analysis(), { hook_points: 80, format_beats: ["hook", "app_reveal", "demo", "offer", "cta"] });
    expect(o).toMatchObject({
      hook_points: 80,
      beats_found: 5,
      beats_required: 5,
      app_ms: 2700,
      disclosure_audio: true,
      disclosure_onscreen: true,
      duration_s: 24,
      captions_in_safe_zone: true,
      single_cta: true,
      ends_on_win_state: true,
      audio_gaps: 0,
      format_order: "in_order",
    });
  });

  it("notices a missing disclosure, two CTAs and dead air", () => {
    const transcript = [
      { t_start_ms: 300, t_end_ms: 2000, text: "I was wrong about photo editing apps." },
      { t_start_ms: 4200, t_end_ms: 6000, text: "Lumi does the rest." },
      { t_start_ms: 8000, t_end_ms: 12_000, text: "Look at that." },
      { t_start_ms: 20_000, t_end_ms: 23_000, text: "Download Lumi and follow me for more." },
    ];
    const o = flowObservationsFromAnalysis(analysis({ transcript, on_screen_text: [{ t_start_ms: 600, t_end_ms: 3000, text: "Wrong about editing apps", in_safe_zone: false }] }), { hook_points: 50 });
    expect(o.disclosure_audio).toBe(false);
    expect(o.disclosure_onscreen).toBe(false);
    expect(o.single_cta).toBe(false);
    expect(o.audio_gaps).toBe(3);
    expect(o.captions_in_safe_zone).toBe(false);
  });

  it("falls back to the app-reveal beat when the hook has no app moment", () => {
    const a = analysis({ hook: { text: "x", hook_type: "pov", lands_at_ms: 2500, spoken_matches_onscreen: true } });
    expect(flowObservationsFromAnalysis(a, { hook_points: 50 }).app_ms).toBe(2600);
    expect(flowObservationsFromAnalysis(analysis({ hook: { text: "x", hook_type: "pov", lands_at_ms: 2500, spoken_matches_onscreen: true }, beats: [] }), { hook_points: 50 }).app_ms).toBeNull();
  });

  it("scores both cards for an analysis in one call", () => {
    const r = scoreAnalysis(analysis(), { hookTrialRates: { confession: 0.09, pov: 0.04, curiosity_gap: 0.06 }, format_beats: ["hook", "app_reveal", "demo", "offer", "cta"] });
    expect(r.hook.points).toBe(scoreHook(r.hook_observations).points);
    expect(r.flow.points).toBe(scoreFlow(r.flow_observations).points);
    expect(r.hook.points).toBe(90);
    expect(r.hook.band).toBe("A");
    expect(r.flow.band).toBe("A");
    expect(r.flow_observations.hook_points).toBe(r.hook.points);
  });
});

describe("format order and win state", () => {
  const found = (...beats: [BeatHit["beat"], number][]): BeatHit[] => beats.map(([beat, t_ms]) => ({ beat, required: true, found: true, t_ms }));
  const fmt = ["hook", "problem", "app_reveal", "demo", "payoff", "cta"] as const;

  it("is in order when found beats follow the format", () => {
    expect(formatOrderOf(fmt, found(["hook", 0], ["app_reveal", 3000], ["payoff", 9000], ["cta", 14_000]))).toBe("in_order");
    expect(formatOrderOf(fmt, [])).toBe("in_order");
    expect(formatOrderOf(fmt, found(["hook", 0]))).toBe("in_order");
  });

  it("is one off when a single beat is in the wrong place", () => {
    expect(formatOrderOf(fmt, found(["hook", 0], ["demo", 2000], ["app_reveal", 3000], ["payoff", 9000], ["cta", 14_000]))).toBe("one_off");
  });

  it("is out of order when several are", () => {
    expect(formatOrderOf(fmt, found(["cta", 0], ["payoff", 2000], ["demo", 3000], ["app_reveal", 9000], ["hook", 14_000]))).toBe("out_of_order");
  });

  it("ignores beats that were not found or are not in the format", () => {
    const hits: BeatHit[] = [{ beat: "hook", required: true, found: true, t_ms: 0 }, { beat: "reaction", required: false, found: true, t_ms: 100 }, { beat: "demo", required: true, found: false }];
    expect(formatOrderOf(fmt, hits)).toBe("in_order");
  });

  it("ends on a win state when the win or payoff beat is in the last 40%", () => {
    expect(endsOnWinState(found(["win_state", 20_000]), 24_000)).toBe(true);
    expect(endsOnWinState(found(["payoff", 15_000]), 24_000)).toBe(true);
    expect(endsOnWinState(found(["payoff", 9000]), 24_000)).toBe(false);
    expect(endsOnWinState([{ beat: "win_state", required: false, found: false }], 24_000)).toBe(false);
    expect(endsOnWinState([], 24_000)).toBe(false);
  });
});

describe("brief-compliance checklist", () => {
  const hits = (): BeatHit[] => brief().beats.map((b) => ({ beat: b.beat, required: b.required, found: true, t_ms: 1000 }));

  it("scores 100 when every check passes, and is labelled a checklist score", () => {
    const r = scoreBriefCompliance({ brief: brief(), beats: hits(), checks: passChecks() });
    expect(r.points).toBe(100);
    expect(r.band).toBe("A");
    expect(r.label).toBe(CHECKLIST_LABEL);
    expect(r.blocks_settlement).toBe(false);
    expect(r.items.reduce((s, i) => s + i.max, 0)).toBe(100);
    expect(r.items.every((i) => i.passed)).toBe(true);
    expect(r.beats).toEqual({ found: 5, required: 5 });
  });

  it("loses 8 points per missing required beat out of five", () => {
    const beats = hits();
    beats[4] = { ...beats[4], found: false };
    const r = scoreBriefCompliance({ brief: brief(), beats, checks: passChecks() });
    expect(r.items[0]).toMatchObject({ id: "required_beats", points: 32, max: 40, passed: false, detail: "4 of 5 required beats found.", fix: "Add the missing beat from the shot checklist." });
    // 100 - 8 for the missing beat, and the CTA beat is the one that is missing, so the CTA item loses its 5 as well
    expect(r.points).toBe(87);
  });

  it("a missing disclosure costs its points and blocks settlement", () => {
    const checks = passChecks().map((c) => (c.check === "disclosure_audio" ? { ...c, result: "fail" as const, message: "No spoken disclosure.", blocks_settlement: true } : c));
    const r = scoreBriefCompliance({ brief: brief(), beats: hits(), checks });
    expect(r.items.find((i) => i.id === "disclosure_audio")).toMatchObject({ points: 0, passed: false, detail: "No spoken disclosure." });
    expect(r.points).toBe(90);
    expect(r.blocks_settlement).toBe(true);
  });

  it("gives half credit for warnings", () => {
    const checks = passChecks().map((c) => (c.check === "disclosure_onscreen" ? { ...c, result: "warn" as const, message: "Short." } : c));
    expect(scoreBriefCompliance({ brief: brief(), beats: hits(), checks }).points).toBe(95);
  });

  it("groups the technical checks at 2 points each", () => {
    const checks = passChecks().map((c) => (c.check === "length" ? { ...c, result: "fail" as const, message: "Too long." } : c.check === "safe_zone" ? { ...c, result: "warn" as const, message: "Text low." } : c));
    const r = scoreBriefCompliance({ brief: brief(), beats: hits(), checks });
    const tech = r.items.find((i) => i.id === "technical");
    expect(tech?.points).toBe(7);
    expect(tech?.detail).toBe("Too long. Text low.");
  });

  it("infers the CTA from the beat, or from an explicit objective count", () => {
    const noCta = hits().map((b) => (b.beat === "cta" ? { ...b, found: false } : b));
    expect(scoreBriefCompliance({ brief: brief(), beats: noCta, checks: passChecks() }).items.find((i) => i.id === "cta")?.points).toBe(0);
    expect(scoreBriefCompliance({ brief: brief(), beats: hits(), checks: passChecks(), cta_objectives: 2 }).items.find((i) => i.id === "cta")?.points).toBe(0);
    expect(scoreBriefCompliance({ brief: brief(), beats: noCta, checks: passChecks(), cta_objectives: 1 }).items.find((i) => i.id === "cta")?.points).toBe(5);
    expect(scoreBriefCompliance({ brief: brief({ cta: "" }), beats: [], checks: passChecks() }).items.find((i) => i.id === "cta")?.points).toBe(0);
  });

  it("requires the offer only when the brief has an offer line", () => {
    const noOffer = hits().map((b) => (b.beat === "offer" ? { ...b, found: false } : b));
    expect(scoreBriefCompliance({ brief: brief(), beats: noOffer, checks: passChecks() }).items.find((i) => i.id === "offer")?.points).toBe(0);
    expect(scoreBriefCompliance({ brief: brief({ offer_line: undefined }), beats: noOffer, checks: passChecks() }).items.find((i) => i.id === "offer")?.points).toBe(5);
  });

  it("scores zero for checks that have not run yet instead of assuming a pass", () => {
    const r = scoreBriefCompliance({ brief: brief(), beats: hits(), checks: [] });
    expect(r.points).toBe(40 + 5 + 5);
    expect(r.items.find((i) => i.id === "disclosure_audio")?.detail).toBe("Not checked yet.");
  });

  it("has full beat credit when the brief requires none", () => {
    const r = scoreBriefCompliance({ brief: brief({ beats: [] }), beats: [], checks: passChecks(), cta_objectives: 1 });
    expect(r.items[0]).toMatchObject({ points: 40, detail: "The brief has no required beats." });
  });
});
