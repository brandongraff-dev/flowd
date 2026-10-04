/**
 * Shared pieces of the mock engine: wording per app category, a seeded RNG per request, the house-rules check every answer passes,
 * and the one-tap actions each kind of answer offers. Pure and deterministic.
 */

import type { BeatId, Category, FloAction } from "@/lib/contract/types";
import { hashString, seededRng, type Rng } from "@/lib/engine/rng";
import { findPhrase } from "@/lib/engine/text";
import type { HookSlots } from "@/lib/engine/hooktext";
import type { FloApp, FloTask } from "../schemas";
import type { BountyDraft, FloResult } from "../types";

/** The model id the mock engine reports (fixtures use the same). */
export const MOCK_MODEL = "flo-mock-1";

/** One seeded RNG per (request, attempt): the same request gives the same answer, and "regenerate" gives a different one. */
export function rngFor(task: FloTask, attempt: number): Rng {
  const anchor = [task.kind, task.context?.id ?? "", "bounty" in task ? task.bounty.id : "", "hook" in task && task.hook ? task.hook : "", "input" in task ? task.input : "", "comment" in task ? task.comment : "", attempt].join("|");
  return seededRng(`flo-mock-1|${anchor}`);
}

/** A stable small integer from text (used for latency and picks that must not depend on call order). */
export const stableInt = (text: string, modulo: number): number => hashString(text) % Math.max(1, modulo);

export interface CategoryWords {
  /** "photo editing". */
  noun: string;
  /** "editing photos". */
  goal: string;
  /** A first-person problem line the creator can adapt. */
  problem: string;
  /** What a person might demo when the app lists no features. */
  features: readonly string[];
}

export const CATEGORY_WORDS: Readonly<Record<Category, CategoryWords>> = {
  ai_photo: {
    noun: "photo editing",
    goal: "editing photos",
    problem: "Editing one photo used to take my whole evening.",
    features: ["one-tap enhance", "background swap", "style presets"],
  },
  ai_assistant: {
    noun: "AI assistant",
    goal: "getting answers",
    problem: "I used to open six tabs to answer one question.",
    features: ["instant answers", "summaries of long text", "voice questions"],
  },
  fitness: {
    noun: "workout",
    goal: "working out",
    problem: "Planning the workout was the part I kept skipping.",
    features: ["short guided workouts", "progress tracking", "streaks"],
  },
  language: {
    noun: "language learning",
    goal: "learning a language",
    problem: "I kept saying I would learn a language and never did.",
    features: ["five-minute lessons", "speaking practice", "daily streaks"],
  },
  productivity: {
    noun: "to-do",
    goal: "planning my week",
    problem: "My to-do list had turned into a graveyard.",
    features: ["quick capture", "weekly planner", "reminders"],
  },
  finance: {
    noun: "budgeting",
    goal: "tracking my spending",
    problem: "I had no idea where my money went each month.",
    features: ["automatic spending categories", "bill reminders", "monthly summary"],
  },
  sleep_mind: {
    noun: "sleep",
    goal: "winding down",
    problem: "I kept scrolling in bed instead of winding down.",
    features: ["wind-down sessions", "sleep sounds", "breathing exercises"],
  },
  music_audio: {
    noun: "music",
    goal: "making music",
    problem: "I always wanted to make a beat and never knew where to start.",
    features: ["loop builder", "voice to melody", "instant mixing"],
  },
  lifestyle: {
    noun: "planning",
    goal: "planning my week",
    problem: "Planning anything with friends took forty messages.",
    features: ["saved collections", "shared plans", "smart suggestions"],
  },
};

export const wordsFor = (app: FloApp): CategoryWords => CATEGORY_WORDS[app.category ?? "lifestyle"];

/** The nth feature the app lists, or a category default, so a line never says "undefined". */
export function featureOf(app: FloApp, index: number): string {
  const own = app.features ?? [];
  const fallback = wordsFor(app).features;
  return own[index] ?? own[0] ?? fallback[index] ?? fallback[0] ?? "the main feature";
}

/** Hook-library slots for an app. */
export function slotsFor(app: FloApp, rng?: Rng): Partial<HookSlots> {
  const words = wordsFor(app);
  return { app: app.name, category: words.noun, feature: featureOf(app, 0), goal: words.goal, number: String(7 + (rng ? Math.floor(rng() * 6) : 0)) };
}

/** Lower-cases the first letter ("Show the app" to "show the app"), keeping acronyms and names. */
export function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Ends a sentence: adds a full stop unless it already ends in . ! ? or a quote. */
export function sentence(text: string): string {
  const t = text.trim();
  return /[.!?"')]$/.test(t) ? t : `${t}.`;
}

// ── house rules ────────────────────────────────────────────────────────────────────────────────

/** Claims no flowd answer may make, whatever the brief says (FTC-careful, BRAND.md 4.3). */
export const NEVER_SAY: readonly string[] = [
  "guaranteed",
  "guarantee",
  "passive income",
  "get rich",
  "quit your job",
  "easy money",
  "unlimited earnings",
  "make money fast",
  "100% safe",
  "cures",
];

/** The first banned or never-say phrase found in `text`, or null. Whole-phrase, case-insensitive. */
export function bannedPhraseIn(text: string, banned: readonly string[] = []): string | null {
  const hit = findPhrase(text, [...NEVER_SAY, ...banned]);
  return hit ? hit.phrase : null;
}

/** Replaces the placeholder code a brief uses ("YOURCODE") with the creator's own code. */
export function withCode(text: string, code: string | undefined): string {
  return code ? text.replace(/YOURCODE/g, code) : text;
}

/** The beat ids a brief requires. */
export function requiredBeats(beats: readonly { beat: BeatId; required: boolean }[]): BeatId[] {
  return beats.filter((b) => b.required).map((b) => b.beat);
}

// ── actions ────────────────────────────────────────────────────────────────────────────────────

export const act = (label: string, kind: string, payload?: string): FloAction => (payload === undefined ? { label, kind } : { label, kind, payload });

/** The id the one-tap actions point at: the request's context, else the bounty. */
export function contextId(task: FloTask): string | undefined {
  if (task.context?.id) return task.context.id;
  if ("bounty" in task) return task.bounty.id;
  return undefined;
}

/** What a generator returns: the parts of a `FloResult` that depend on the request. The provider adds model, latency and source. */
export interface MockAnswer extends Pick<FloResult, "surface" | "title" | "outputs" | "notes" | "actions" | "label"> {
  draft?: BountyDraft;
}
