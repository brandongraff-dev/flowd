/**
 * Text-only Hook Score: the free tool at /tools/hook-score. Paste the first line of a video and get a band, reasons and rewrites.
 *
 * It scores the words only (no video), against the hook patterns that win for app ads (confession, curiosity gap, specific number, POV,
 * direct question, risk reversal, pattern interrupt), specificity, and the 2-second rule: a hook has to land in about two seconds of
 * speech, which is roughly six words at an energetic 3 words per second.
 *
 * It is a checklist score, labelled that way, and it never promises results.
 */

import type { HookType, ScoreBand } from "@/lib/contract/types";
import { CHECKLIST_LABEL } from "./constants";
import { bandFor } from "./scoring";
import { clamp } from "./stats";
import { normalizeText, tokenize, wordCount } from "./text";

/** Energetic UGC speech: about 180 words a minute. */
export const WORDS_PER_SECOND = 3;
/** The 2-second rule. */
export const HOOK_TARGET_SECONDS = 2;

// ── the library ────────────────────────────────────────────────────────────────────────────────

/** The slots a hook template can carry. Missing slots fall back to neutral words so a template always reads. */
export interface HookSlots {
  app: string;
  /** The app's category in plain words, e.g. "photo editing". */
  category: string;
  feature: string;
  /** What the viewer wants, e.g. "editing photos". */
  goal: string;
  number: string;
}

const DEFAULT_SLOTS: HookSlots = { app: "this app", category: "photo editing", feature: "one feature", goal: "editing photos", number: "7" };

/** Fill-in hooks by type. First sentences are kept short on purpose: the 2-second rule reads the first sentence. */
export const HOOK_LIBRARY: Readonly<Record<HookType, readonly string[]>> = {
  confession: [
    "I was wrong about {category} apps.",
    "I didn't expect {app} to work this well.",
    "Okay, I owe {app} an apology.",
    "I deleted every other {category} app.",
    "I never thought I'd say this about {app}.",
  ],
  curiosity_gap: [
    "Wait until you see what {app} did.",
    "Nobody told me {app} could do this.",
    "Here's what happened after one week.",
    "I found the one {feature} nobody talks about.",
    "This is why my {goal} changed.",
  ],
  specific_number: [
    "{number} minutes a day. Here's what changed.",
    "{number} days with {app}. Here's the result.",
    "{number} {category} apps tested. One won.",
    "I spent {number} days on {app}.",
    "{number} seconds. That's all {app} needs.",
  ],
  pov: [
    "POV: you found the one {category} app.",
    "POV: {goal} takes {number} minutes now.",
    "POV: you stopped paying for {category} apps.",
    "When {app} just does it for you.",
  ],
  direct_question: [
    "Why is nobody talking about {app}?",
    "Still doing {goal} by hand?",
    "What if {goal} took {number} minutes?",
    "Why does {app} feel illegal to use?",
  ],
  risk_reversal: [
    "Try {app} free. No card needed.",
    "{app} is free for {number} days.",
    "I didn't pay a cent for week one.",
    "Free for {number} days. No catch.",
  ],
  pattern_interrupt: [
    "Wait, {app} did that?",
    "Stop scrolling. This saves {goal}.",
    "Hold on. Watch this.",
    "No way {app} is this fast.",
  ],
};

/** Fills a template's {slots}. Missing slots use neutral defaults. */
export function fillHook(template: string, slots: Partial<HookSlots> = {}): string {
  const s = { ...DEFAULT_SLOTS, ...slots };
  return template.replace(/\{(app|category|feature|goal|number)\}/g, (_, key: keyof HookSlots) => s[key]);
}

// ── detection ──────────────────────────────────────────────────────────────────────────────────

const PATTERN_RULES: readonly (readonly [HookType, readonly RegExp[]])[] = [
  [
    "confession",
    [
      /\bi (?:was|am) (?:so )?wrong\b/,
      /\bi (?:didn'?t|did not) (?:expect|think|believe|know|see)\b/,
      /\bconfession\b/,
      /\bi (?:have to|need to|got to|gotta) admit\b/,
      /\bi (?:finally )?admit\b/,
      /\bi owe\b/,
      /\bi (?:never thought|can'?t believe|used to hate|used to think)\b/,
      /\bunpopular opinion\b/,
      /\bi deleted\b/,
      /\bi lied\b/,
    ],
  ],
  [
    "curiosity_gap",
    [
      /\bwait until you see\b/,
      /\bwait for it\b/,
      /\byou won'?t believe\b/,
      /\bhere'?s (?:what|why|how|the)\b/,
      /\bwhat (?:happened|this app did|it did|\w+ did)\b/,
      /\bthe (?:one|only) (?:thing|trick|feature|hack|setting)\b/,
      /\b(?:nobody|no one) (?:tells|told|talks|is talking|knows|knew)\b/,
      /\bsecret\b/,
      /\bturns? out\b/,
      /\bthis is why\b/,
      /\bwhat they don'?t tell you\b/,
      /\bthe catch\b/,
      /\.\.\.$/,
    ],
  ],
  ["specific_number", [/\$\s?\d/, /\b\d+(?:[.,]\d+)?\s*(?:%|x|k\b|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|hours?|dollars?|bucks|photos?|steps?|ways?|reasons?|tips?|apps?|things?|features?|times?)/, /\b(?:one|two|three|four|five|six|seven|ten|twelve|thirty) (?:minutes?|seconds?|days?|weeks?|ways?|things?|steps?|apps?)\b/]],
  ["pov", [/^pov\b/, /\bpov:/, /^when you\b/, /^when (?:\w+ ){0,2}just\b/, /\bthat moment when\b/, /^me (?:when|after|trying)\b/]],
  ["direct_question", [/\?/, /^(?:why|how|what|who|which|do you|did you|have you|are you|is it|is there|can you|could you|ever wonder|still)\b/]],
  [
    "risk_reversal",
    [
      /\bfree\b/,
      /\bno (?:card|credit card|payment|catch|risk|subscription|strings)\b/,
      /\bcancel anytime\b/,
      /\b(?:didn'?t|did not|never) pay\b/,
      /\bwithout paying\b/,
      /\bmoney[- ]back\b/,
      /\bnothing to lose\b/,
    ],
  ],
  ["pattern_interrupt", [/^(?:wait|stop|hold on|no way|listen|okay stop|ok stop|um what|excuse me|did that just|oh my)\b/, /^\.\.\./]],
];

/** Every library pattern the hook uses. Order follows the library order, not strength. */
export function detectPatterns(text: string): HookType[] {
  const t = normalizeText(text);
  return PATTERN_RULES.filter(([, rules]) => rules.some((re) => re.test(t))).map(([type]) => type);
}

const FILLER_OPENERS: readonly RegExp[] = [
  /^(?:hey|hi|hello|yo|what'?s up|sup)\b(?:[ ,]+(?:guys|everyone|everybody|friends|y'?all|there|team|fam))?/,
  /^(?:so,? )?(?:today|in this video|in today'?s video|welcome|welcome back)\b/,
  /^(?:so,? )?(?:i'?m going to|i am going to|let me|i want to|i wanted to|i'?m here to) (?:show|tell|talk|share|introduce)\b/,
  /^(?:so basically|okay so|ok so|um|uh)\b/,
];

const VAGUE_HYPE = /\b(?:amazing|incredible|unbelievable|game[- ]changer|game changing|best ever|best app ever|life[- ]changing|must[- ]have|mind[- ]blowing|revolutionary|insane app|literally the best|so good)\b/;

const RISKY_CLAIMS: readonly RegExp[] = [
  /\bguarantee(?:d|s)?\b/,
  /\bget rich\b/,
  /\bpassive income\b/,
  /\bquit your (?:job|9[- ]?5)\b/,
  /\b(?:make|earn|made|earned)\s+\$?\d[\d,]*(?:k)?\s*(?:a|per|every|\/)\s*(?:day|week|month|hour)\b/,
  /\bcures?\b/,
  /\blose\s+\d+\s*(?:lbs?|pounds|kg)\b/,
  /\b100%\s*(?:safe|effective|accurate|guaranteed|free)\b/,
];

const SPECIFICITY_UNITS = /(?:\$\s?\d|\b\d+(?:[.,]\d+)?\s*(?:%|x|k\b|minutes?|mins?|seconds?|days?|weeks?|months?|hours?|photos?|steps?|ways?|apps?|times?|dollars?))/;

/** The first sentence: what the 2-second rule reads. Only . ? ! and an ellipsis end it, so "POV: you finally..." and commas do not. */
export function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const m = /^(.*?[.?!…])(?:\s|$)/.exec(trimmed);
  return (m ? m[1] : trimmed).trim();
}

export interface TwoSecondRule {
  /** The sentence that was timed. */
  sentence: string;
  words: number;
  /** Estimated speaking time at 3 words per second. */
  est_seconds: number;
  /** At most 2.0 s. */
  passes: boolean;
  /** Words that fit in 2 seconds. */
  target_words: number;
}

/** The 2-second rule: does the first sentence land in about two seconds of speech? */
export function twoSecondRule(text: string): TwoSecondRule {
  const sentence = firstSentence(text);
  const words = wordCount(sentence);
  const est = words / WORDS_PER_SECOND;
  return { sentence, words, est_seconds: Math.round(est * 10) / 10, passes: words > 0 && est <= HOOK_TARGET_SECONDS + 1e-9, target_words: Math.floor(HOOK_TARGET_SECONDS * WORDS_PER_SECOND) };
}

// ── scoring ────────────────────────────────────────────────────────────────────────────────────

export interface HookTextItem {
  id: "pattern" | "two_second_rule" | "specificity" | "personal" | "open_loop" | "no_filler_opening" | "safe_claims";
  label: string;
  points: number;
  max: number;
  passed: boolean;
  reason: string;
  fix?: string;
}

export interface HookTextResult {
  /** 0 to 100. */
  score: number;
  band: ScoreBand;
  /** Always "Checklist score. It gets smarter as bounties settle." */
  label: string;
  items: HookTextItem[];
  /** Every library pattern found. */
  patterns: HookType[];
  /** The strongest pattern, or null. */
  primary_pattern: HookType | null;
  rule: TwoSecondRule;
  /** Words in the whole hook. */
  words: number;
  /** Things worth a warning that are not about score: hype claims. */
  flags: string[];
  /** True when a risky claim (guaranteed, passive income, a cure) capped the score at a D: such a hook cannot be approved. */
  capped: boolean;
  /** Fixes for lost points, biggest first (the item `fix` lines, ordered). */
  suggestions: string[];
}

/** A hook with a risky claim never scores above this (the top of a D). */
export const MAX_SCORE_WITH_RISKY_CLAIM = 54;

/** Strongest first, for choosing the primary pattern. Library hooks that name a proven pattern beat a bare interrupt. */
const PATTERN_STRENGTH: readonly HookType[] = ["confession", "curiosity_gap", "specific_number", "risk_reversal", "pov", "direct_question", "pattern_interrupt"];

function timeFor(words: number): number {
  const t = words / WORDS_PER_SECOND;
  if (t <= 2.0 + 1e-9) return 25;
  if (t <= 2.5 + 1e-9) return 19;
  if (t <= 3.0 + 1e-9) return 12;
  if (t <= 4.0 + 1e-9) return 6;
  return 0;
}

/**
 * Scores the text of a hook. Weights (sum 100): proven pattern 25, lands in 2 seconds 25, specific 15, personal 10, open loop 10, no filler
 * opening 10, safe claims 5. Pure and deterministic. An empty hook scores 0 with an E and one suggestion.
 */
export function scoreHookText(text: string): HookTextResult {
  const patterns = detectPatterns(text);
  const t = normalizeText(text);
  const rule = twoSecondRule(text);
  const words = wordCount(text);
  const flags: string[] = [];
  const items: HookTextItem[] = [];

  const item = (id: HookTextItem["id"], label: string, max: number, points: number, reason: string, fix?: string): void => {
    const p = clamp(Math.round(points), 0, max);
    items.push({ id, label, points: p, max, passed: p === max, reason, ...(fix && p < max ? { fix } : {}) });
  };

  if (words === 0) {
    item("pattern", "Uses a proven hook pattern", 25, 0, "There is no hook yet.", "Write one line: a confession, a curiosity gap, a number, a POV, a question or a risk reversal.");
    item("two_second_rule", "Lands inside 2 seconds", 25, 0, "There is no hook yet.");
    item("specificity", "Specific, not vague", 15, 0, "There is no hook yet.");
    item("personal", "Sounds like a person", 10, 0, "There is no hook yet.");
    item("open_loop", "Makes you want the next line", 10, 0, "There is no hook yet.");
    item("no_filler_opening", "Starts with the point", 10, 0, "There is no hook yet.");
    item("safe_claims", "No risky claims", 5, 5, "Nothing to flag.");
    return { score: 0, band: "E", label: CHECKLIST_LABEL, items, patterns: [], primary_pattern: null, rule, words: 0, flags, capped: false, suggestions: ["Write the first line of your video, then score it."] };
  }

  // 1. pattern
  const strong = patterns.filter((p) => p !== "pattern_interrupt");
  const primary = PATTERN_STRENGTH.find((p) => patterns.includes(p)) ?? null;
  item(
    "pattern",
    "Uses a proven hook pattern",
    25,
    strong.length > 0 ? 25 : patterns.length > 0 ? 15 : 0,
    strong.length > 0 ? `Pattern: ${strong.map((p) => p.replace("_", " ")).join(", ")}.` : patterns.length > 0 ? "Only an interrupt (\"Wait\", \"Stop\"). Pair it with a real pattern." : "No proven pattern found.",
    "Try a confession (\"I was wrong about...\"), a curiosity gap (\"Wait until you see...\"), a number or a question.",
  );

  // 2. two-second rule
  const timePts = timeFor(rule.words);
  item(
    "two_second_rule",
    "Lands inside 2 seconds",
    25,
    timePts,
    rule.passes ? `The first line is ${rule.words} words, about ${rule.est_seconds.toFixed(1)}s. It lands in time.` : `The first line is ${rule.words} words, about ${rule.est_seconds.toFixed(1)}s. The target is ${HOOK_TARGET_SECONDS}s (about ${rule.target_words} words).`,
    `Cut the first sentence to ${rule.target_words} words or fewer, then add the detail after it.`,
  );

  // 3. specificity
  const hasUnit = SPECIFICITY_UNITS.test(t);
  const hasDigit = /\d/.test(t);
  const vague = VAGUE_HYPE.test(t);
  const specPts = (hasUnit ? 9 : hasDigit ? 5 : 0) + (vague ? 0 : 6);
  item(
    "specificity",
    "Specific, not vague",
    15,
    specPts,
    vague ? 'Vague hype words ("amazing", "game changer") say nothing. Name the result.' : hasUnit ? "A specific number or timeframe makes it believable." : hasDigit ? "There is a number, but no unit." : "No number or timeframe. Specific beats clever.",
    'Add a real number or timeframe: "12 minutes a day", "30 days", "$0".',
  );

  // 4. personal
  const toks = tokenize(text);
  const personal = toks.some((w) => ["i", "i'm", "i've", "my", "me", "you", "your", "you're", "pov"].includes(w));
  item("personal", "Sounds like a person", 10, personal ? 10 : 0, personal ? "It speaks to one person (I or you)." : "No I or you. It reads like an ad.", 'Say "I" or "you": "I tried...", "you finally...".');

  // 5. open loop
  const loop = patterns.includes("curiosity_gap") || patterns.includes("direct_question");
  const softLoop = patterns.includes("confession") || patterns.includes("pov") || patterns.includes("specific_number");
  item("open_loop", "Makes you want the next line", 10, loop ? 10 : softLoop ? 6 : 0, loop ? "It opens a question the next line answers." : softLoop ? "It hints at a story, but does not open a gap." : "Nothing makes the viewer wait for the next line.", 'Open a gap: "Here\'s what happened...", "Wait until you see...", or ask the question.');

  // 6. filler opening
  const filler = FILLER_OPENERS.some((re) => re.test(t));
  item("no_filler_opening", "Starts with the point", 10, filler ? 0 : 10, filler ? 'It opens with a greeting or "today I will". Those spend your first seconds on nothing.' : "No wasted words at the start.", 'Cut "Hey guys" and "In this video". Start on the claim.');

  // 7. risky claims
  const risky = RISKY_CLAIMS.some((re) => re.test(t));
  if (risky) flags.push("This hook makes a claim that earnings or health rules treat as risky (guaranteed, passive income, a cure). Say what you did, not what anyone will get.");
  item("safe_claims", "No risky claims", 5, risky ? 0 : 5, risky ? "A guarantee or earnings or health claim." : "No risky claims.", "Say what you did, not what the viewer will get. Never promise income or results.");

  const raw = items.reduce((s, i) => s + i.points, 0);
  // A hook that promises earnings, a guarantee or a cure cannot be approved, so it never scores above a D.
  const score = risky ? Math.min(raw, MAX_SCORE_WITH_RISKY_CLAIM) : raw;
  const suggestions = items
    .filter((i) => !i.passed && i.fix)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .map((i) => i.fix as string);
  return { score, band: bandFor(score), label: CHECKLIST_LABEL, items, patterns, primary_pattern: primary, rule, words, flags, capped: risky && raw > score, suggestions };
}

// ── rewrites ───────────────────────────────────────────────────────────────────────────────────

export interface HookRewrite {
  text: string;
  pattern: HookType;
  score: number;
  band: ScoreBand;
}

/**
 * Rewrites for a hook: fills the library templates with the app's words and scores each, best first. Types already in the original are
 * still offered (a stronger version of the same pattern is a fine suggestion). `limit` defaults to 5; the result has at most one hook per
 * template and is deterministic.
 */
export function suggestRewrites(params: { slots?: Partial<HookSlots>; avoid_types?: readonly HookType[]; limit?: number }): HookRewrite[] {
  const { slots = {}, avoid_types = [], limit = 5 } = params;
  const out: HookRewrite[] = [];
  for (const [type, templates] of Object.entries(HOOK_LIBRARY) as [HookType, readonly string[]][]) {
    if (avoid_types.includes(type)) continue;
    for (const tpl of templates) {
      const text = fillHook(tpl, slots);
      const r = scoreHookText(text);
      out.push({ text, pattern: type, score: r.score, band: r.band });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text)).slice(0, Math.max(0, limit));
}
