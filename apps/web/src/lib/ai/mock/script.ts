/**
 * Script drafting: a bounty's brief plus a winning format become up to three scripts, one line per beat with the timing the format
 * enforces. Hooks come from the engine's library (scored for the 2-second rule), the offer and call to action come from the brief, and
 * a final "Brief check" says whether the format covers every beat the brief requires.
 */

import type { BeatId } from "@/lib/contract/types";
import { timecode } from "@/lib/engine/text";
import type { FloFormat, FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, featureOf, lowerFirst, requiredBeats, rngFor, withCode, wordsFor, type MockAnswer } from "./common";
import { FALLBACK_FORMATS } from "./formats";
import { hookCandidates, pickDistinct, tightenHook, type HookCandidate } from "./hooks";

const TITLE_COUNT = ["", "A script", "Two scripts", "Three scripts"] as const;

interface BeatContext {
  task: FloTaskOf<"script">;
  format: FloFormat;
  hook: string;
  /** Which feature the next demo-type beat uses; grows as beats consume features. */
  featureIndex: number;
  hasOffer: boolean;
}

/** The instruction for one beat, in the voice of the existing suggestions: what to do, what to say, how long to hold. */
function instruction(beat: FloFormat["beats"][number], ctx: BeatContext): string {
  const { app, brief } = ctx.task.bounty;
  const words = wordsFor(app);
  const by = timecode(beat.t_end_s * 1000);
  switch (beat.beat as BeatId) {
    case "hook":
      return ctx.format.faceless ? `Put it on the first slide, big and short: "${ctx.hook}"` : `Say it to camera and put the same words on screen: "${ctx.hook}"`;
    case "problem":
      return ctx.format.id === "tmpl_confession"
        ? `Say what you expected, in your own words. For example: "${words.problem}"`
        : `Name the annoyance in one line. For example: "${words.problem}"`;
    case "app_reveal":
      return `Cut to a screen recording of ${app.name} by ${by}.`;
    case "demo": {
      const feature = lowerFirst(featureOf(app, ctx.featureIndex));
      ctx.featureIndex += 1;
      return `Show ${feature} for at least five seconds. Say what you tapped, not what the app does.`;
    }
    case "key_feature": {
      const feature = lowerFirst(featureOf(app, ctx.featureIndex));
      ctx.featureIndex += 1;
      return `Show ${feature} working on screen. One feature only.`;
    }
    case "reaction":
      return "React honestly when the result lands. No fake gasp.";
    case "payoff":
      return "Hold the result on screen for two full seconds, then say what changed for you.";
    case "proof":
      return "Give one real number, or a before and after you can show on screen.";
    case "offer":
      return ctx.hasOffer ? `Say the offer once, in your own words: "${(brief.offer_line ?? `try ${app.name} free`).replace(/[.!]+$/, "")}". Then move on.` : `If ${app.name} is free to try, say so once. If it is not, skip this beat.`;
    case "cta":
      return `One call to action: ${withCode(brief.cta, ctx.task.creator_code).replace(/[.!]+$/, "")}. Then stop talking.`;
    case "win_state":
      return `End on the moment ${app.name} delivered, then cut.`;
    case "end_card":
      return "Hold the end card for one second with the app name.";
  }
}

interface Timed {
  beat: FloFormat["beats"][number];
  start: number;
  end: number;
}

/** The beats that stay in this script (an optional offer beat is dropped when the brief has no offer), re-timed so there is no gap. */
function timeline(format: FloFormat, hasOffer: boolean): Timed[] {
  const out: Timed[] = [];
  let shift = 0;
  for (const beat of format.beats) {
    const length = beat.t_end_s - beat.t_start_s;
    if (beat.beat === "offer" && !beat.required && !hasOffer) {
      shift += length;
      continue;
    }
    out.push({ beat, start: beat.t_start_s - shift, end: beat.t_end_s - shift });
  }
  return out;
}

function briefCheck(format: FloFormat, required: readonly BeatId[]): string {
  const covered = new Set(format.beats.map((b) => b.beat));
  const missing = required.filter((b) => !covered.has(b));
  if (missing.length === 0) return "Brief check: this format covers every beat the brief requires.";
  const names = missing.map((b) => `"${b.replace("_", " ")}"`).join(" and ");
  return `Brief check: the brief also requires ${names}. Add ${missing.length === 1 ? "it" : "them"} before the call to action, or pick a format that has ${missing.length === 1 ? "it" : "them"}.`;
}

/** Formats for each option: the person's pick first, then the rest rotated by the attempt so a regenerate offers new formats. */
function formatsFor(task: FloTaskOf<"script">, count: number, attempt: number): FloFormat[] {
  const seen = new Set<string>();
  const unique = (list: readonly FloFormat[]): FloFormat[] => list.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
  const primary = task.format ? unique([task.format]) : [];
  const rest = unique([...(task.formats ?? []), ...FALLBACK_FORMATS]);
  const need = Math.max(0, count - primary.length);
  const offset = rest.length > 0 ? (attempt * need) % rest.length : 0;
  const rotated = [...rest.slice(offset), ...rest.slice(0, offset)];
  return [...primary, ...rotated].slice(0, count);
}

export function answerScript(task: FloTaskOf<"script">, attempt: number): MockAnswer {
  const rng = rngFor(task, attempt);
  const { bounty } = task;
  const { app, brief } = bounty;
  const count = task.options ?? 3;
  const hasOffer = Boolean(brief.offer_line) || app.has_free_trial === true;
  const required = requiredBeats(brief.beats);
  const formats = formatsFor(task, count, attempt);

  const usedHooks: string[] = [];
  const options = formats.map((format, i) => {
    let hook: string | null = null;
    if (i === 0 && task.hook) hook = tightenHook(task.hook) ?? task.hook.trim();
    if (!hook) {
      const pool: HookCandidate[] = hookCandidates(app, rng, { types: format.hook_types, banned: brief.banned_claims, exclude: usedHooks });
      const picked = pickDistinct(pool, 1)[0] ?? hookCandidates(app, rng, { banned: brief.banned_claims, exclude: usedHooks })[0];
      hook = picked?.text ?? `I tried ${app.name} so you do not have to guess.`;
    }
    usedHooks.push(hook);

    const ctx: BeatContext = { task, format, hook, featureIndex: 0, hasOffer };
    const timed = timeline(format, hasOffer);
    const duration = Math.max(format.min_duration_s, Math.min(format.max_duration_s, timed[timed.length - 1]?.end ?? format.min_duration_s));
    const lines = timed.map(({ beat, start, end }) => `${beat.label} (${start} to ${end} s): ${instruction(beat, ctx)}`);
    return [`Option ${i + 1}: ${format.name}, about ${duration} s`, ...lines, `Caption: ${brief.disclosure_text}. Studio adds it for you.`, briefCheck(format, required)].join("\n");
  });

  return {
    surface: task.surface ?? "studio",
    title: `${TITLE_COUNT[Math.min(3, options.length)] ?? "Scripts"} for ${bounty.title}`,
    outputs: options,
    notes: [
      `Each opening is a library hook filled with ${app.name}'s words and checked against the 2-second rule. Say the first line to camera.`,
      "Each script follows its format's beat timing, so the live checklist in Studio ticks the same beats as you record.",
    ],
    actions: [act("Send to Studio", "open_studio", bounty.id), act("Copy option 1", "copy", "0")],
    label: FLO_LABEL,
  };
}
