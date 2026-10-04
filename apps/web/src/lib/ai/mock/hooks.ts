/**
 * Hook rewrites. Candidates come from the engine's hook library, filled with the app's words and scored by the engine's text Hook Score,
 * so every suggestion Flo makes is one the checklist rates well, and the explanation ("about 1.9 s to say") is the engine's own.
 */

import { HOOK_TYPE_META, type HookType } from "@/lib/contract/types";
import { HOOK_LIBRARY, detectPatterns, fillHook, firstSentence, scoreHookText } from "@/lib/engine/hooktext";
import type { Rng } from "@/lib/engine/rng";
import { shuffled } from "@/lib/engine/rng";
import { normalizeText, wordCount } from "@/lib/engine/text";
import type { FloApp, FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, bannedPhraseIn, contextId, rngFor, slotsFor, type MockAnswer } from "./common";

export interface HookCandidate {
  text: string;
  pattern: HookType | null;
  score: number;
  seconds: number;
  /** The first sentence lands inside the 2-second rule. */
  lands: boolean;
}

const FILLERS: readonly RegExp[] = [
  /^(?:hey|hi|hello|yo|what'?s up)(?: guys| everyone| everybody| friends| y'?all| there)?[,!. ]+/i,
  /^(?:so,? )?(?:today|in this video|in today'?s video|welcome back)[,]? /i,
  /^(?:so,? )?(?:i'?m going to|i am going to|let me|i want to|i wanted to) (?:show|tell|talk about|share)(?: you)? /i,
  /^(?:okay so|ok so|so basically|um|uh|so)[,]? /i,
];

/** Words that make a phrase a thought rather than a noun fragment: a verb, an auxiliary or a person. */
const THOUGHT = /\b(?:is|are|was|were|am|be|been|i|i'm|i've|i'd|you|we|my|me|it|it's|have|has|had|do|does|did|can|could|will|would|just|got|get|made|make|tried|try|used|use|love|hate|need|want|think|know|found|spent|stopped|started|saved|changed|works?)\b/i;

/** Library templates that read badly once a gerund goal is filled in ("Still doing editing photos by hand?"). */
const AWKWARD = /\bdoing \w+ing\b/i;

const capitalise = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * The creator's own opening line, tightened: greetings and "today I will" dropped, the first sentence kept, and a long one cut at its first
 * comma, colon, dash or "and" so it can land in about two seconds. Returns null when there is nothing to tighten.
 */
export function tightenHook(original: string): string | null {
  let t = original.trim().replace(/\s+/g, " ");
  if (!t) return null;
  for (const re of FILLERS) t = t.replace(re, "");
  t = firstSentence(t);
  if (wordCount(t) > 7) {
    const cut = t.search(/[,:;—–]| - | and | but | because /i);
    if (cut > 0) {
      const head = t.slice(0, cut).trim();
      // A fragment ("This amazing photo app") is not a hook: cut only when what is left is a thought, with a verb or a person in it.
      if (wordCount(head) >= 4 && THOUGHT.test(head)) t = head;
    }
  }
  t = capitalise(t.replace(/[,:;—–-]+$/, "").trim());
  if (!/[.!?…]$/.test(t)) t = `${t}.`;
  return normalizeText(t) === normalizeText(original) ? null : t;
}

export interface CandidateOptions {
  /** Hook types to draw from (default: all seven). */
  types?: readonly HookType[];
  banned?: readonly string[];
  /** Texts not to repeat. */
  exclude?: readonly string[];
}

/** Library hooks filled with the app's words, scored, best first. A little seeded noise reorders near-ties, so a regenerate gives new picks. */
export function hookCandidates(app: FloApp, rng: Rng, options: CandidateOptions = {}): HookCandidate[] {
  const slots = slotsFor(app, rng);
  const types = options.types && options.types.length > 0 ? options.types : (Object.keys(HOOK_LIBRARY) as HookType[]);
  const exclude = new Set((options.exclude ?? []).map(normalizeText));
  const out: (HookCandidate & { key: number })[] = [];
  for (const type of types) {
    for (const template of shuffled(rng, HOOK_LIBRARY[type])) {
      const text = fillHook(template, slots);
      if (exclude.has(normalizeText(text)) || bannedPhraseIn(text, options.banned) || AWKWARD.test(text)) continue;
      const scored = scoreHookText(text);
      out.push({ text, pattern: type, score: scored.score, seconds: scored.rule.est_seconds, lands: scored.rule.passes, key: scored.score + rng() * 4 + (scored.rule.passes ? 6 : 0) });
    }
  }
  return out.sort((a, b) => b.key - a.key).map(({ key: _key, ...rest }) => rest);
}

/** The best candidate for each distinct pattern, then the rest, up to `limit`. Variety over repetition. */
export function pickDistinct(candidates: readonly HookCandidate[], limit: number): HookCandidate[] {
  const picked: HookCandidate[] = [];
  const seen = new Set<string | null>();
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (seen.has(c.pattern)) continue;
    seen.add(c.pattern);
    picked.push(c);
  }
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five"] as const;

/** "Three sharper openings". */
const countWord = (n: number): string => NUMBER_WORDS[Math.min(5, Math.max(0, n))] ?? String(n);

const lands = (c: Pick<HookCandidate, "lands">): string => (c.lands ? "it lands by 2 seconds." : "trim a word or two to land by 2 seconds.");

export function describeHook(c: HookCandidate): string {
  const label = c.pattern ? HOOK_TYPE_META[c.pattern].label : "Your own words";
  return `${c.text} (${label}, about ${c.seconds.toFixed(1)} s to say: ${lands(c)})`;
}

/** "Rewrite this hook so it lands in 2 seconds": three openings, each with its pattern and its timing. */
export function answerHookRewrite(task: FloTaskOf<"hook_rewrite">, attempt: number): MockAnswer {
  const rng = rngFor(task, attempt);
  const limit = task.limit ?? 3;
  const original = scoreHookText(task.hook);
  const types = task.target_type ? [task.target_type] : undefined;

  const options: HookCandidate[] = [];
  const tight = task.target_type ? null : tightenHook(task.hook);
  if (tight) {
    const s = scoreHookText(tight);
    // Keep the creator's own wording when tightening makes it a genuinely better hook; it is the rewrite that sounds most like them.
    if (s.score >= 50 || s.score >= original.score + 10) options.push({ text: tight, pattern: s.primary_pattern ?? detectPatterns(tight)[0] ?? null, score: s.score, seconds: s.rule.est_seconds, lands: s.rule.passes });
  }
  const library = hookCandidates(task.app, rng, { types, exclude: [task.hook, ...options.map((o) => o.text)] });
  const rest = pickDistinct(
    // Prefer patterns the original does not already use, so the options are new ideas.
    [...library.filter((c) => c.pattern && !original.patterns.includes(c.pattern)), ...library],
    limit - options.length,
  );
  const chosen = [...options, ...rest.filter((c) => !options.some((o) => o.text === c.text))].slice(0, limit);

  const ctx = contextId(task);
  const notes = [`Your hook scores ${original.score} now (${original.band}, a checklist score). ${original.suggestions[0] ?? "It already passes the checklist."}`, `Each option shows its pattern and how long it takes to say. Under 2 seconds is the target.`];
  return {
    surface: task.surface ?? "studio",
    title: task.target_type ? `${countWord(chosen.length)} ${HOOK_TYPE_META[task.target_type].label.toLowerCase()} openings` : `${countWord(chosen.length)} sharper openings`,
    outputs: chosen.map(describeHook),
    notes,
    actions: [act("Apply to my script", "apply_fix", ctx), act("Copy the best", "copy", "0")],
    label: FLO_LABEL,
  };
}

